from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import AuthCode


def _normalize_balance(value: int | None) -> int:
    return max(value or 0, 0)


def get_team_credits(auth_code: AuthCode) -> int:
    """Return current team credits for the auth code."""
    team = auth_code.team
    if not team:
        return 0
    return _normalize_balance(team.credits)


def get_total_available_credits(auth_code: AuthCode) -> int:
    """Sum of personal and team credits."""
    return _normalize_balance(auth_code.credits) + get_team_credits(auth_code)


def deduct_credits(db: Session, auth_code: AuthCode, credits_needed: int) -> None:
    """Deduct credits by consuming team credits first, then personal credits."""
    if credits_needed <= 0:
        return

    total_available = get_total_available_credits(auth_code)
    if total_available < credits_needed:
        team_balance = get_team_credits(auth_code)
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"积分不足，需要 {credits_needed} 积分，"
                f"团队余额 {team_balance} · 个人余额 {_normalize_balance(auth_code.credits)}"
            ),
        )

    remaining = credits_needed
    team = auth_code.team

    if team and team.credits:
        from_team = min(_normalize_balance(team.credits), remaining)
        team.credits -= from_team
        remaining -= from_team

    if remaining > 0:
        if _normalize_balance(auth_code.credits) < remaining:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="个人积分不足"
            )
        auth_code.credits -= remaining

    db.add(auth_code)
    if team:
        db.add(team)

    db.commit()
    db.refresh(auth_code)
    if team:
        db.refresh(team)
