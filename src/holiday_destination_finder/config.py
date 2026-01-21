import logging
import sys

def setup_logging(level: str = "INFO"):
    """
    Configure logging to output to stdout.
    This ensures logs appear in both local terminal and Render logs.

    Call this once at application startup (e.g., in api.py or main.py).
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ],
        force=True  # Override any existing configuration
    )

    # Set level for our package loggers
    logging.getLogger("holiday_destination_finder").setLevel(log_level)

    # Reduce noise from third-party libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
