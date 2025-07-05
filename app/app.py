import tornado.ioloop
import tornado.web
import json
from datetime import datetime
import time
import secrets
import redis
import uuid
import tornado.log
from logging.handlers import RotatingFileHandler
from handlers.websocket_handler import RoomManager,TextUpdateHandler
import logging
from log_config import configure_logging
from authkey import redis_client
from tornado.log import enable_pretty_logging
configure_logging()



import re

def is_valid_room_id(room_id):
    return re.fullmatch(r'^[a-zA-Z0-9_-]{6,64}$', room_id) is not None



class BaseHandler(tornado.web.RequestHandler):
	def prepare(self):
		self.nonce = secrets.token_hex(16)
		self.set_header(
			"Content-Security-Policy",
			"img-src 'self' data:; "
		)

	def render(self, template_name, **kwargs):
		"""Pass the nonce to the template."""
		kwargs["nonce"] = self.nonce
		super().render(template_name, **kwargs)




class MainHandler(BaseHandler):
	def get(self):
		for cookie in self.request.cookies:
			self.clear_cookie(cookie)
		country = self.request.headers.get("CF-IPCountry", "unknown")
		ip_address = self.request.headers.get("X-Real-IP", self.request.remote_ip)
		user_agent = self.request.headers.get("User-Agent", "unknown")
		tornado.log.access_log.info("IP: %s, User-Agent: %s - Requested for Homepage. Origin: %s", ip_address, user_agent,country)
		self.render("editor-index.html")


class UserGuideHandler(tornado.web.RequestHandler):
	def get(self):
		ip_address = self.request.headers.get("X-Real-IP", self.request.remote_ip)
		user_agent = self.request.headers.get("User-Agent", "unknown")
		tornado.log.access_log.info("IP: %s, User-Agent: %s - Requested for user Guide", ip_address, user_agent)
		self.render("user-guide.html")


def generate_token():
	server_time = str(time.time())
	server_time=server_time.replace('.','')
	time_part1 = server_time[:5]
	time_part2 = server_time[5:]
	token_uuid = uuid.uuid4()
	token = f"{token_uuid}-{time_part1}-{time_part2}"
	return token
			
class StarterHandler(BaseHandler):
	def get(self):
		country = self.request.headers.get("CF-IPCountry", "unknown")
		if country != "unknown":
			websocket_token = generate_token() + '-'+country
			websocket_token_id = generate_token() +'-'+ country
		else:
			websocket_token = generate_token()
			websocket_token_id = generate_token()
		redis_client.set(websocket_token_id, websocket_token, ex=1800)
		redis_client.set(websocket_token, websocket_token_id, ex=1800)
		admin_data={"admin":True,'admin_websocket':websocket_token,'admin_share_token':websocket_token_id}
		admin_data=json.dumps(admin_data)
		self.set_secure_cookie("session_id",admin_data)
		self.set_secure_cookie("p_t", websocket_token, expires=time.time() + 1800)
		ip_address = self.request.headers.get("X-Real-IP", self.request.remote_ip)
		user_agent = self.request.headers.get("User-Agent", "unknown")
		tornado.log.access_log.info("IP: %s, User-Agent: %s - Requested for Starter Page", ip_address, user_agent)
		self.render("starter.html",websocket=websocket_token, user_token=websocket_token_id)




class PortalHandler(BaseHandler):
	def get(self, unique_room_id):
		if not is_valid_room_id(unique_room_id):
			return
		try:
			websocket_id=unique_room_id
			websocket_id = redis_client.get(unique_room_id)
			if websocket_id:
				websocket_id = websocket_id.decode('utf-8')
				self.set_secure_cookie("p_t", websocket_id, expires=time.time() + 1800)
				self.render("receiver.html", websocket=websocket_id, user_token=unique_room_id)
			else:
				self.write(self.redirect_message("Invalid or expired token."))
		except ValueError:
			self.write(self.redirect_message("Invalid URL."))

	def redirect_message(self, message):
		return f"""
		<html>
		<head>
			<meta http-equiv="refresh" content="5; url=/" />
			<title>Redirecting...</title>
			<style>
				body {{ text-align: center; margin-top: 50px; }}
				.alert {{ padding: 20px; color: white; background-color: red; }}
			</style>
		</head>
		<body>
			<div class="alert">{message}</div>
			<p>You will be redirected in 5 seconds...</p>
		</body>
		</html>
		"""


class PrivacyHandler(BaseHandler):
	def get(self):
		self.render("privacy.html")



cookie_secret = secrets.token_urlsafe(32)
def make_app(debug=False):
	enable_pretty_logging()
	return tornado.web.Application([
		(r"/", MainHandler),
		(r"/privacy", PrivacyHandler),
		(r"/user-guide", UserGuideHandler),
		(r"/starter", StarterHandler),
		(r'/text_update/(.*)', TextUpdateHandler),
		(r'/portal/([^/]+)', PortalHandler),
	], static_path='static',template_path="templates",debug=debug, cookie_secret=cookie_secret, websocket_ping_interval=5, websocket_ping_timeout=10, websocket_max_message_size=10240)

if __name__ == "__main__":
	app = make_app()
	app.listen(5000,xheaders=True)
	tornado.ioloop.IOLoop.current().start()
