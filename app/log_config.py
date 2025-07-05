import logging
from logging.handlers import RotatingFileHandler
import tornado.log
import os

def configure_logging(log_file_path='log_files/portal_access_log.log', max_log_size=400 * 1024, backup_count=5):
    os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
    handler = RotatingFileHandler(
        log_file_path, maxBytes=max_log_size, backupCount=backup_count
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(
        logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    )

    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.INFO)
    tornado.log.enable_pretty_logging()

    logging.info("Logging configuration completed.")
