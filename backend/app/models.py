from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class AuthCode(Base):
    __tablename__ = "auth_codes"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    credits = Column(Integer, default=0)
    expire_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="active")
    description = Column(Text, nullable=True)
    ip_whitelist = Column(String(500), nullable=True)
    allowed_models = Column(String(500), nullable=True)
    contact_name = Column(String(120), nullable=True)
    creator_name = Column(String(150), nullable=True)
    phone_number = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class AssistantProfile(Base):
    __tablename__ = "assistant_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, index=True)
    type = Column(String(20), nullable=False, default="official")
    owner_code = Column(String(100), nullable=True, index=True)
    visibility = Column(String(20), nullable=False, default="public")
    cover_url = Column(String(500), nullable=False)
    cover_type = Column(String(20), nullable=False, default="image")
    definition = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    categories = Column(Text, nullable=True, default="[]")
    supports_image = Column(Boolean, default=True)
    supports_video = Column(Boolean, default=False)
    accent_color = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    category_links = relationship(
        "AssistantCategoryLink",
        back_populates="assistant",
        cascade="all, delete-orphan",
    )

    model_links = relationship(
        "AssistantModelLink",
        back_populates="assistant",
        cascade="all, delete-orphan",
    )

    favorites = relationship(
        "AssistantFavorite",
        back_populates="assistant",
        cascade="all, delete-orphan",
    )

    comments = relationship(
        "AssistantComment",
        back_populates="assistant",
        cascade="all, delete-orphan",
    )

class AssistantCategory(Base):
    __tablename__ = "assistant_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    slug = Column(String(120), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    accent_color = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    links = relationship(
        "AssistantCategoryLink",
        back_populates="category",
        cascade="all, delete-orphan",
    )


class AssistantCategoryLink(Base):
    __tablename__ = "assistant_category_links"
    __table_args__ = (
        UniqueConstraint("assistant_id", "category_id", name="uq_assistant_category_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assistant_id = Column(
        Integer,
        ForeignKey("assistant_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id = Column(
        Integer,
        ForeignKey("assistant_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=func.now())

    assistant = relationship("AssistantProfile", back_populates="category_links")
    category = relationship("AssistantCategory", back_populates="links")


class ModelDefinition(Base):
    __tablename__ = "model_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, unique=True, index=True)
    alias = Column(String(150), nullable=True)
    description = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    model_type = Column(String(20), nullable=False, default="image")
    order_index = Column(Integer, nullable=False, default=100)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    assistant_links = relationship(
        "AssistantModelLink",
        back_populates="model",
        cascade="all, delete-orphan",
    )


class AssistantModelLink(Base):
    __tablename__ = "assistant_model_links"
    __table_args__ = (
        UniqueConstraint("assistant_id", "model_id", name="uq_assistant_model_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    assistant_id = Column(
        Integer,
        ForeignKey("assistant_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model_id = Column(
        Integer,
        ForeignKey("model_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=func.now())

    assistant = relationship("AssistantProfile", back_populates="model_links")
    model = relationship("ModelDefinition", back_populates="assistant_links")


class FavoriteGroup(Base):
    __tablename__ = "favorite_groups"
    __table_args__ = (
        UniqueConstraint(
            "auth_code",
            "name",
            name="uq_favorite_group_name",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    auth_code = Column(
        String(100),
        ForeignKey("auth_codes.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    favorites = relationship("AssistantFavorite", back_populates="group")


class AssistantFavorite(Base):
    __tablename__ = "assistant_favorites"
    __table_args__ = (
        UniqueConstraint(
            "auth_code",
            "assistant_id",
            name="uq_assistant_favorite_pair",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    auth_code = Column(
        String(100),
        ForeignKey("auth_codes.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assistant_id = Column(
        Integer,
        ForeignKey("assistant_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id = Column(
        Integer,
        ForeignKey("favorite_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=func.now())

    assistant = relationship("AssistantProfile", back_populates="favorites")
    group = relationship("FavoriteGroup", back_populates="favorites")


class AssistantComment(Base):
    __tablename__ = "assistant_comments"

    id = Column(Integer, primary_key=True, index=True)
    assistant_id = Column(
        Integer,
        ForeignKey("assistant_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    auth_code = Column(
        String(100),
        ForeignKey("auth_codes.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content = Column(Text, nullable=False)
    like_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    assistant = relationship("AssistantProfile", back_populates="comments")
    author = relationship("AuthCode")
    likes = relationship(
        "AssistantCommentLike",
        back_populates="comment",
        cascade="all, delete-orphan",
    )


class AssistantCommentLike(Base):
    __tablename__ = "assistant_comment_likes"
    __table_args__ = (
        UniqueConstraint(
            "comment_id",
            "auth_code",
            name="uq_comment_like_owner",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(
        Integer,
        ForeignKey("assistant_comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    auth_code = Column(
        String(100),
        ForeignKey("auth_codes.code", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=func.now())

    comment = relationship("AssistantComment", back_populates="likes")
    voter = relationship("AuthCode")


class GenerationRecord(Base):
    __tablename__ = "generation_records"
    
    id = Column(Integer, primary_key=True, index=True)
    auth_code = Column(String(100), ForeignKey("auth_codes.code"), nullable=False)
    mode_type = Column(String(20), nullable=False)  # "multi" or "puzzle"
    input_images = Column(Text, nullable=True)  # JSON array of image paths
    prompt_text = Column(Text, nullable=False)
    output_count = Column(Integer, nullable=False)
    output_images = Column(Text, nullable=True)  # JSON array of output image paths
    credits_used = Column(Integer, nullable=False)
    processing_time = Column(Integer, nullable=True)  # seconds
    created_at = Column(DateTime, default=func.now())

class TemplateCase(Base):
    __tablename__ = "template_cases"
    
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    preview_image = Column(String(500), nullable=True)
    input_images = Column(Text, nullable=True)  # JSON array of example images
    prompt_text = Column(Text, nullable=False)
    tags = Column(Text, nullable=True)  # JSON array of tags
    popularity = Column(Integer, default=0)
    mode_type = Column(String(20), nullable=False)  # "multi" or "puzzle"
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())