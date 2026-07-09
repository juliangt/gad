# backend/src/gad/schemas/auth.py
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: UUID


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    access_token: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    verification_level: str
    reputation_score: float


class VerifyEmailIn(BaseModel):
    token: str
