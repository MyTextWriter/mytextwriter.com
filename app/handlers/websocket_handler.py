import tornado.ioloop
import tornado.web
import json
from tornado.websocket import WebSocketHandler
import redis
import uuid
import tornado.websocket
from authkey import redis_client

class RoomManager:
	rooms = {}
	room_admins = {}

	@classmethod
	def add_connection(cls, room_id, connection):
		if room_id not in cls.rooms:
			cls.rooms[room_id] = {}
		user_id = str(uuid.uuid4())
		connection.user_id = user_id
		cls.rooms[room_id][user_id] = connection

		if room_id not in cls.room_admins:
			session_id = connection.get_secure_cookie("session_id")
			if session_id:
				connection.is_admin = True
				cls.room_admins[room_id] = connection

		return user_id

	@classmethod
	def remove_connection(cls, room_id, connection):
		user_id = getattr(connection, "user_id", None)
		if room_id in cls.rooms and user_id in cls.rooms[room_id]:
			del cls.rooms[room_id][user_id]

			if cls.room_admins.get(room_id) == connection:
				connection.broadcast_active_users_to_exit()
				session_id = connection.get_secure_cookie("session_id")
				if session_id:
					session_id=session_id.decode("utf-8")

				session_data = json.loads(session_id)
				user_token = session_data.get("admin_share_token")
				redis_client.delete(user_token)
				del cls.room_admins[room_id]


	@classmethod
	def broadcast(cls, room_id, message, exclude=None):
		if room_id not in cls.rooms:
			return
		for user_id, conn in cls.rooms[room_id].items():
			if conn != exclude:
				try:
					conn.write_message(message)
				except Exception as e:
					print(f"Error broadcasting message: {e}")

	@classmethod
	def emit_to_admin(cls, room_id, message):
		admin_connection = cls.room_admins.get(room_id)
		if not admin_connection:
			return False
		try:
			admin_connection.write_message(message)
			return True
		except Exception as e:
			print(f"Error sending message to admin: {e}")
			return False

	@classmethod
	def emit_to_user(cls, room_id, user_id, message):
		if room_id in cls.rooms and user_id in cls.rooms[room_id]:
			try:
				cls.rooms[room_id][user_id].write_message(message)
				return True
			except Exception as e:
				print(f"Error sending message to user {user_id}: {e}")
				return False
		print(f"User {user_id} not found in room {room_id}")
		return False

	@classmethod
	def get_room_size(cls, room_id):
		return len(cls.rooms.get(room_id, {}))

	@classmethod
	def is_admin(cls, room_id, connection):
		return cls.room_admins.get(room_id) == connection


import re

def is_valid_room_id(room_id):
    return re.fullmatch(r'^[a-zA-Z0-9_-]{6,64}$', room_id) is not None


class TextUpdateHandler(WebSocketHandler):
	def open(self, room_id):

		if not is_valid_room_id(room_id):
			return
		self.room_id = room_id
		self.is_admin = False

		if RoomManager.get_room_size(room_id) >= 20:
			self.write_message({"error": "Room is full."})
			self.close()
			return

		self.user_id = RoomManager.add_connection(room_id, self)

		self.broadcast_active_users()

	def on_message(self, message):
		if not redis_client.exists(self.room_id):
			active_users_message = {"event": "exit"}
			self.write_message(active_users_message)	
			self.close()
			return

		try:
			data = json.loads(message)
			event = data.get("event")
			if not event:
				self.write_message({"error": "Missing 'event' field in message."})
				return

			if event == "text_update":
				self.handle_text_update(data)
				#print(data)			
				
			else:
				self.write_message({"error": f"Unknown event: {event}"})
		except json.JSONDecodeError:
			self.write_message({"error": "Invalid JSON format."})
		except Exception as e:
			print(f"Error handling message: {e}")
			self.write_message({"error": "An error occurred."})

	def on_close(self):
		RoomManager.remove_connection(self.room_id, self)
		self.broadcast_active_users()
		#print(f"Connection closed from room {self.room_id}. Total: {RoomManager.get_room_size(self.room_id)}")


	def handle_text_update(self, data):
		message = {
			"event": "text_update",
			"text": data.get("text")
		}
		RoomManager.broadcast(self.room_id, message, exclude=self)


	def broadcast_active_users(self):
		active_users_message = {
			"event": "active_users",
			"payload": {"count": RoomManager.get_room_size(self.room_id)}
		}
		RoomManager.broadcast(self.room_id, active_users_message)


	def broadcast_active_users_to_exit(self):
		active_users_message = {"event": "exit"}
		RoomManager.broadcast(self.room_id, active_users_message)


	def broadcast_active_users(self):
		active_users_message = {
			"event": "active_users",
			"payload": {"count": RoomManager.get_room_size(self.room_id)}
		}
		RoomManager.broadcast(self.room_id, active_users_message)


