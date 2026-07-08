# backend/src/gad/exceptions.py
class GADError(Exception):
    """Base de excepciones de dominio."""

    status_code: int = 400
    code: str = "error"

    def __init__(self, detail: str = ""):
        self.detail = detail or self.__class__.__name__
        super().__init__(self.detail)


class AuthError(GADError):
    status_code = 401
    code = "auth_error"


class InvalidCredentialsError(AuthError):
    code = "invalid_credentials"


class InvalidTokenError(AuthError):
    code = "invalid_token"


class EmailAlreadyExistsError(GADError):
    status_code = 409
    code = "email_already_exists"


class NotFoundError(GADError):
    status_code = 404
    code = "not_found"


class ConflictError(GADError):
    status_code = 409
    code = "conflict"


class ValidationError(GADError):
    status_code = 422
    code = "validation_error"


class OAuthError(GADError):
    status_code = 400
    code = "oauth_error"


class RateLimitExceeded(GADError):
    status_code = 429
    code = "rate_limit_exceeded"
