class ProviderUnavailable(Exception):
    """A provider key is not configured."""


class ProviderFailed(Exception):
    """A provider call failed."""


class NoSpeechDetected(Exception):
    """Nothing recognisable was heard in the recording."""
