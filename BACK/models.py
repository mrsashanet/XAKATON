from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)

    memberships = relationship("Membership", back_populates="user")
    owned_communities = relationship("Community", back_populates="owner")
    tracks_added = relationship("Track", back_populates="author")
    votes = relationship("Vote", back_populates="user")

class Community(Base):
    __tablename__ = "communities"
    id = Column(Integer, primary_key=True)
    com_name = Column(String, nullable=False)
    invite_token = Column(String, unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    owner = relationship("User", back_populates="owned_communities")
    memberships = relationship("Membership", back_populates="community", cascade="all, delete-orphan")
    tracks = relationship("Track", back_populates="community", cascade="all, delete-orphan")

class Membership(Base):
    __tablename__ = "memberships"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="memberships")
    community = relationship("Community", back_populates="memberships")

class Track(Base):
    __tablename__ = "tracks"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    file_url = Column(String, nullable=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    community_id = Column(Integer, ForeignKey("communities.id"),nullable=False,index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    community = relationship("Community", back_populates="tracks")
    author = relationship("User", back_populates="tracks_added")
    votes = relationship("Vote", back_populates="track", cascade="all, delete-orphan")

class Vote(Base):
    __tablename__ = "votes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, index=True)
    value = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="votes")
    track = relationship("Track", back_populates="votes")