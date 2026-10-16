from database import Base, engine, SessionLocal
from models import User, Community, Membership, Track

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

db = SessionLocal()

user = User(username="test", password="hash")
db.add(user)
db.commit()
db.refresh(user)

community = Community(com_name="Тест", invite_token="abc123", owner_id=user.id)
db.add(community)
db.commit()
db.refresh(community)

db.add(Membership(user_id=user.id, community_id=community.id))
db.commit()

track = Track(title="Test", artist="Artist", community_id=community.id, added_by=user.id)
db.add(track)
db.commit()

print(f"OK: user_id={user.id}, community_id={community.id}, track_id={track.id}")
db.close()