"""Buying plans with Razorpay (one-time payments via the Orders API and Standard Checkout).

Flow: the API creates an order at the plan's price from our database -> the browser opens Razorpay Checkout ->
the browser sends back Razorpay's signed receipt, which we verify before giving the plan. Razorpay's `order.paid`
webhook does the same server-to-server, so a closed tab never loses a paid plan. Each order is applied only once.
"""

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import date, timedelta

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from app import db
from app.auth import current_user
from app.errors import ProviderFailed

router = APIRouter(prefix="/v1")
log = logging.getLogger("uvicorn.error")
RAZORPAY_API = "https://api.razorpay.com/v1"


class NewOrder(BaseModel):
    plan_id: int


class CheckoutResult(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _keys() -> tuple[str, str]:
    key_id, secret = os.environ.get("RAZORPAY_KEY_ID"), os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_id or not secret:
        raise HTTPException(503, "Payments are not set up yet (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET).")
    return key_id, secret


def _signature_ok(message: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def create_order(amount_paise: int, receipt: str, notes: dict) -> str:
    key_id, secret = _keys()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{RAZORPAY_API}/orders", auth=(key_id, secret),
                                  json={"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes})
    except httpx.HTTPError as e:
        raise ProviderFailed(f"Razorpay request failed: {e}") from e
    if r.status_code != 200:
        raise ProviderFailed(f"Razorpay returned HTTP {r.status_code}")
    return r.json()["id"]


def _starts(user: dict) -> str:
    return (date.fromisoformat(user["plan_expires"]) + timedelta(days=1)).isoformat()


def _summary(user: dict) -> dict:
    return {
        "current": {"id": user["plan"]["id"], "name": user["plan"]["name"], "expires": user["plan_expires"],
                    "interviews_left": db.interviews_left(user)},
        "upcoming": {"id": user["upcoming"]["id"], "name": user["upcoming"]["name"], "starts": _starts(user)}
        if user["upcoming"] else None,
    }


def _mark_paid(con, order_id: str, payment_id: str) -> str | None:
    """Apply a paid order once. Returns the outcome, or None if it was already applied (or isn't ours)."""
    claimed = con.execute(
        "update payments set status = 'paid', razorpay_payment_id = ?, paid_at = current_timestamp "
        "where razorpay_order_id = ? and status = 'created'", (payment_id, order_id)).rowcount
    if not claimed:
        return None
    row = con.execute("select user_id, plan_id from payments where razorpay_order_id = ?", (order_id,)).fetchone()
    user = con.execute("select * from users where id = ?", (row["user_id"],)).fetchone() if row["user_id"] else None
    if not user:
        return None  # account deleted before payment completed; refund from the Razorpay dashboard
    plan = dict(con.execute("select * from plans where id = ?", (row["plan_id"],)).fetchone())
    outcome = db.apply_purchase(con, db.load_plan(con, dict(user)), plan)
    con.execute("update payments set outcome = ? where razorpay_order_id = ?", (outcome, order_id))
    return outcome


@router.get("/plans")
def plans(user: dict = Depends(current_user)):
    """Plans the learner can buy, each with what buying it would do now."""
    with db.connect() as con:
        rows = [dict(r) for r in con.execute(
            "select id, name, price_inr, days, interviews, daily_minutes, azure_voice from plans "
            "where listed = 1 and id != ? and price_inr > 0 order by price_inr, id", (db.FREE_PLAN_ID,))]
    for plan in rows:
        if db.is_upgrade(user["plan"], plan) or not user["plan_expires"]:
            plan["on_purchase"] = "activates_now"
        elif user["upcoming"]:
            plan["on_purchase"] = "blocked"  # one upcoming plan at a time
        else:
            plan["on_purchase"] = "starts_later"
            plan["starts"] = _starts(user)
    return {"plans": rows, **_summary(user)}


@router.post("/payments/order")
async def new_order(body: NewOrder, user: dict = Depends(current_user)):
    key_id, _ = _keys()
    with db.connect() as con:
        plan = con.execute("select * from plans where id = ?", (body.plan_id,)).fetchone()
    if not plan or not plan["listed"] or plan["id"] == db.FREE_PLAN_ID or plan["price_inr"] <= 0:
        raise HTTPException(409, "That plan isn't available to buy.")
    if user["upcoming"] and not db.is_upgrade(user["plan"], dict(plan)):
        raise HTTPException(409, f"You already have {user['upcoming']['name']} lined up. "
                                 "Buy another plan after it starts.")
    amount = plan["price_inr"] * 100  # the price always comes from our database, never from the browser
    order_id = await create_order(amount, f"u{user['id']}-{int(time.time())}",
                                  {"user_id": str(user["id"]), "plan_id": str(plan["id"])})
    with db.connect() as con:
        con.execute("insert into payments (user_id, plan_id, amount_paise, razorpay_order_id) values (?, ?, ?, ?)",
                    (user["id"], plan["id"], amount, order_id))
    return {"order_id": order_id, "key_id": key_id, "amount": amount, "currency": "INR", "plan_name": plan["name"],
            "prefill": {"name": user["name"], "email": user["email"] or "", "contact": user["phone"] or ""}}


@router.post("/payments/verify")
def verify(body: CheckoutResult, user: dict = Depends(current_user)):
    _, secret = _keys()
    message = f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode()
    if not _signature_ok(message, body.razorpay_signature, secret):
        raise HTTPException(400, "We couldn't confirm that payment. If money was taken, contact support.")
    with db.connect() as con:
        if not con.execute("select 1 from payments where razorpay_order_id = ? and user_id = ?",
                           (body.razorpay_order_id, user["id"])).fetchone():
            raise HTTPException(404, "Payment not found.")
        outcome = _mark_paid(con, body.razorpay_order_id, body.razorpay_payment_id)
        if outcome is None:  # already applied, e.g. by the webhook
            outcome = con.execute("select outcome from payments where razorpay_order_id = ?",
                                  (body.razorpay_order_id,)).fetchone()["outcome"]
        fresh = db.load_plan(con, dict(con.execute("select * from users where id = ?", (user["id"],)).fetchone()))
    return {"outcome": outcome, **_summary(fresh)}


@router.post("/payments/webhook")
async def webhook(request: Request, x_razorpay_signature: str = Header("")):
    """Razorpay -> API (set this URL and RAZORPAY_WEBHOOK_SECRET in the Razorpay dashboard; event: order.paid)."""
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "Webhook not configured.")
    raw = await request.body()  # the signature covers the exact bytes Razorpay sent
    if not _signature_ok(raw, x_razorpay_signature, secret):
        raise HTTPException(400, "Bad signature.")
    event = json.loads(raw)
    if event.get("event") in ("order.paid", "payment.captured"):
        payment = event.get("payload", {}).get("payment", {}).get("entity", {})
        if payment.get("order_id") and payment.get("id"):
            with db.connect() as con:
                outcome = _mark_paid(con, payment["order_id"], payment["id"])
            if outcome:
                log.info("Razorpay webhook applied %s: %s", payment["order_id"], outcome)
    return {"ok": True}  # 200 for everything verified, so Razorpay doesn't retry events we ignore


@router.post("/plans/activate-upcoming")
def activate_upcoming(user: dict = Depends(current_user)):
    """Start the upcoming plan early, once the current plan's interviews are used up."""
    if not user["upcoming"]:
        raise HTTPException(409, "You don't have an upcoming plan.")
    if db.interviews_left(user) != 0:
        raise HTTPException(409, "You can start your next plan early once this plan's interviews are used up.")
    with db.connect() as con:
        db.assign_plan(con, user["id"], user["upcoming"])
        con.execute("update users set upcoming_plan_id = null where id = ?", (user["id"],))
        fresh = db.load_plan(con, dict(con.execute("select * from users where id = ?", (user["id"],)).fetchone()))
    return _summary(fresh)
