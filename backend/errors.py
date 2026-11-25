"""User-facing failures with stable codes.

The English message is a fallback for logs and clients that do not know the
code; the interface renders `code` and `params` in the selected language
(frontend/src/errors.ts holds the matching table).
"""


class AppError(ValueError):
    def __init__(self, code, message, status=400, **params):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.params = params

    def body(self):
        return {"detail": self.message, "code": self.code, "params": self.params}
