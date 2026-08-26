"""
NexWare application-wide constants and enumerations.

All magic strings and business constants must be defined here and imported
from here — never hardcoded inline in routers or services.
"""
from enum import Enum


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PickListStatus(str, Enum):
    DRAFT = "draft"
    ASSIGNED = "assigned"
    PICKING = "picking"
    WAITING_VERIFICATION = "waiting_verification"
    VERIFIED = "verified"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class UserRole(str, Enum):
    ADMIN = "admin"
    PICKER = "picker"
    SALES_PERSON = "sales_person"


class LpoStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    DISAPPROVED = "disapproved"
    PROCESSED = "processed"


class LpoSource(str, Enum):
    UPLOAD = "upload"
    MANUAL = "manual"
    MOBILE = "mobile"


class NotificationType(str, Enum):
    PICK_ASSIGNMENT = "pick_assignment"
    PICK_RETURNED = "pick_returned"
    JOB_CANCELLED = "job_cancelled"
    GENERAL = "general"


class AssignmentStatus(str, Enum):
    ASSIGNED = "assigned"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# ---------------------------------------------------------------------------
# Computed sets / lists (used in DB queries)
# ---------------------------------------------------------------------------

#: Statuses that represent an actively worked-on picklist
ACTIVE_PICK_STATUSES: list[str] = [
    PickListStatus.ASSIGNED,
    PickListStatus.PICKING,
    PickListStatus.WAITING_VERIFICATION,
]

#: Statuses considered "closed" — used to exclude from active load counts
CLOSED_PICK_STATUSES: list[str] = [
    PickListStatus.COMPLETED,
    PickListStatus.CANCELLED,
]


# ---------------------------------------------------------------------------
# Storage buckets & folders
# ---------------------------------------------------------------------------

BUCKET_CUSTOMER_CONFIRMATION = "customer-confirmations"
FOLDER_MOBILE_LPOS = "signed_lpos"
FOLDER_CUSTOMER_SIGNED = "signed_lpos"


# ---------------------------------------------------------------------------
# File upload limits
# ---------------------------------------------------------------------------

MAX_UPLOAD_SIZE_MB = 10
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

#: MIME types allowed for pure PDF-only upload endpoints
ALLOWED_PDF_MIME_TYPES: set[str] = {"application/pdf"}

#: MIME types allowed when both PDF and camera images are accepted
ALLOWED_DOCUMENT_MIME_TYPES: set[str] = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
}


# ---------------------------------------------------------------------------
# Inventory / catalogue defaults
# ---------------------------------------------------------------------------

DEFAULT_UNIT = "PCS"
DEFAULT_SKU_SIZE_CATEGORY = ">100g"
BARCODE_ITEM_NUMBER_PREFIX = "BC-"


# ---------------------------------------------------------------------------
# Weight tolerance for box validation
# ---------------------------------------------------------------------------

#: Acceptable deviation from expected box weight (e.g. 0.05 = ±5 %)
WEIGHT_TOLERANCE_FRACTION = 0.005
