"""Database models for tenant configuration."""

from datetime import datetime
from typing import List

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class KeywordCategory(Base):
    """Keyword category for organizing tags hierarchically."""
    
    __tablename__ = "keyword_categories"
    
    id = Column(Integer, primary_key=True)
    tenant_id = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    parent_id = Column(Integer, ForeignKey('keyword_categories.id', ondelete='CASCADE'), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    parent = relationship("KeywordCategory", remote_side=[id], back_populates="subcategories")
    subcategories = relationship("KeywordCategory", back_populates="parent", cascade="all, delete-orphan")
    keywords = relationship("Keyword", back_populates="category", cascade="all, delete-orphan")


class Keyword(Base):
    """Individual keyword within a category."""
    
    __tablename__ = "keywords"
    
    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey('keyword_categories.id', ondelete='CASCADE'), nullable=False, index=True)
    keyword = Column(String(100), nullable=False)
    prompt = Column(Text, nullable=True)  # Optional custom prompt for tagging
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    category = relationship("KeywordCategory", back_populates="keywords")


class Person(Base):
    """Person for facial recognition."""
    
    __tablename__ = "people"
    
    id = Column(Integer, primary_key=True)
    tenant_id = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    aliases = Column(JSON, nullable=True)  # List of alternative names
    face_embedding_ref = Column(String(255), nullable=True)  # Reference to stored face embedding
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "aliases": self.aliases or [],
            "face_embedding_ref": self.face_embedding_ref
        }
