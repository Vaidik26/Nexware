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


class PortalModule(str, Enum):
    """
    A screen group a portal account may be allowed to open.

    These are the only three the web portal actually has. A module is a
    *feature* grant; it says nothing about which customers' data is visible —
    that is the area/channel half, below.
    """

    SALES_DASH = "SALES_DASH"
    PROCUREMENT = "PROCUREMENT"
    USER_ADMIN = "USER_ADMIN"


class DashboardRole(str, Enum):
    """
    The base role on a ``dashboard_users`` row.

    The role supplies a *default* module and area set. An explicit grant on the
    account replaces that default outright; clearing the grant drops the account
    back onto it. See ``backend.core.access``.
    """

    DEV = "DEV"
    FINANCE = "FINANCE"
    MANAGER = "MANAGER"
    SALES = "SALES"
    WAREHOUSE = "WAREHOUSE"


class SalesChannel(str, Enum):
    """
    Which book of a supervisor area a grant reaches.

    A grant with NO channel (stored NULL) reaches both books. KEY is the
    customer master's "Direct Sales" type — the business calls that book Key
    Sales — and VAN is the van-route book.
    """

    KEY = "KEY"
    VAN = "VAN"


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
# Portal access model — role defaults
# ---------------------------------------------------------------------------
# The vocabulary lives here; the rule that turns it into an answer lives in
# ``backend.core.access``. Both halves are mirrored for the browser in
# ``frontend/src/lib/access.ts`` so a tile can be hidden without a round trip —
# but this side is the enforcing copy. If the two disagree, this one wins.

#: Sentinel area meaning "every supervisor area, including ones added later".
#: It is not one of the territories; it is the absence of a territory filter.
ALL_AREAS = "ALL"

#: What each role grants when the account carries no explicit module grant.
#:
#: SALES and WAREHOUSE default to no portal modules at all, and that is not an
#: oversight: their work happens in the standalone LPO/picking apps, which this
#: portal does not serve. Such an account has a login that opens nothing until
#: an admin grants it a module explicitly — the honest state, not a bug to
#: paper over with a default nobody asked for.
ROLE_DEFAULT_MODULES: dict[DashboardRole, tuple[PortalModule, ...]] = {
    DashboardRole.DEV: (
        PortalModule.SALES_DASH,
        PortalModule.PROCUREMENT,
        PortalModule.USER_ADMIN,
    ),
    DashboardRole.FINANCE: (
        PortalModule.SALES_DASH,
        PortalModule.PROCUREMENT,
        PortalModule.USER_ADMIN,
    ),
    DashboardRole.MANAGER: (PortalModule.SALES_DASH,),
    DashboardRole.SALES: (),
    DashboardRole.WAREHOUSE: (),
}

#: What each role's data scope is when the account carries no explicit area
#: grant.
#:
#: SALES gets NOTHING — a sales account with no explicit territory reaches no
#: customer at all, rather than falling open to every one of them. WAREHOUSE
#: gets ALL because warehouse work is centralised: a picker packs boxes for
#: every region, so restricting them by territory would describe a workflow
#: that does not exist.
ROLE_DEFAULT_AREAS: dict[DashboardRole, tuple[str, ...]] = {
    DashboardRole.DEV: (ALL_AREAS,),
    DashboardRole.FINANCE: (ALL_AREAS,),
    DashboardRole.MANAGER: (ALL_AREAS,),
    DashboardRole.SALES: (),
    DashboardRole.WAREHOUSE: (ALL_AREAS,),
}

#: Human labels for the roles, shown wherever a role is displayed.
ROLE_LABELS: dict[DashboardRole, str] = {
    DashboardRole.DEV: "Developer · superuser",
    DashboardRole.FINANCE: "Finance",
    DashboardRole.MANAGER: "Manager",
    DashboardRole.SALES: "Area Sales",
    DashboardRole.WAREHOUSE: "Warehouse",
}

#: Human labels for the two sales channels. A null channel is "both channels"
#: and is deliberately not in this map — absence is the value.
CHANNEL_LABELS: dict[SalesChannel, str] = {
    SalesChannel.KEY: "Key Sales",
    SalesChannel.VAN: "Van Sales",
}


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
