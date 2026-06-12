---
name: JWT jose sub must be string
description: python-jose library requires the JWT "sub" claim to be a string, not an integer. Passing an int raises "Subject must be a string."
---

**Rule:** Always encode `sub` as `str(user.id)` when calling `jwt.encode`, and decode with `int(payload.get("sub"))` when reading it back.

**Why:** The `python-jose` library validates RFC 7519 strictly — `sub` must be a string type. Passing an integer silently creates a token that decodes fine locally but raises `JWTError: Subject must be a string.` when verified via `jwt.decode`, causing all protected endpoints to return 401.

**How to apply:** In FastAPI auth:
```python
# Encoding
token = create_access_token({"sub": str(user.id)})

# Decoding
sub = payload.get("sub")
if sub is None: raise 401
user_id = int(sub)
```
