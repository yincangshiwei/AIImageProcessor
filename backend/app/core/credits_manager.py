from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from app.models import AuthCode, ModelDefinition


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


def resolve_model_credit_cost(
    db: Session,
    model_name: Optional[str],
) -> tuple[ModelDefinition, int]:
    """Return model record with the effective credit cost."""
    if not model_name or not model_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="必须指定模型名称",
        )

    normalized_name = model_name.strip()

    required_fields = (
        "credit_cost",
        "discount_credit_cost",
        "is_free_to_use",
    )
    missing_fields = [
        field for field in required_fields if not hasattr(ModelDefinition, field)
    ]
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "模型定义缺少字段："
                + ", ".join(missing_fields)
                + "。请重新同步 backend/app/models.py ，执行 SQL 脚本 backend/sql/202513_add_model_credit_recharge_and_agents.sql 并完整重启后端服务。"
            ),
        )

    record = (
        db.query(ModelDefinition)
        .filter(ModelDefinition.name == normalized_name)
        .filter(ModelDefinition.status == "active")
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"模型不存在或不可用：{normalized_name}",
        )

    if record.is_free_to_use:
        return record, 0

    if record.discount_credit_cost is not None and record.discount_credit_cost >= 0:
        return record, max(record.discount_credit_cost, 0)

    return record, max(record.credit_cost, 0)
