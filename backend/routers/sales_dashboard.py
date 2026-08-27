"""
Sales Dashboard router.

Every route is gated on the ``SALES_DASH`` module and scoped to the caller's
granted territories. The browser no longer talks to the sales-app Supabase
project at all — it talks to this, and this decides what comes back.

``require_module`` attaches the resolved access to the returned user, so each
endpoint scopes from the same answer the gate used rather than resolving it
again and risking a different one.
"""
import logging

from fastapi import APIRouter, Depends

from backend.constants import PortalModule
from backend.dependencies import require_module
from backend.schemas.sales_dashboard import DashboardFilters
from backend.services import sales_data_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sales-dashboard", tags=["sales-dashboard"])

sales_dash = require_module(PortalModule.SALES_DASH)


@router.get("/bootstrap")
async def read_bootstrap(caller=Depends(sales_dash)):
    """
    Reference data for the dashboard, scoped to the caller.

    The customer dictionary and the territory maps are cut down to what this
    account reaches; the SKU catalogue and month range are the same for
    everyone.
    """
    return await sales_data_service.bootstrap(caller.access)


@router.post("/view")
async def read_dashboard_view(
    filters: DashboardFilters,
    caller=Depends(sales_dash),
):
    """
    One dashboard view.

    The filters are the viewer's; the customer scope is the account's grant
    intersected with them, applied server-side. A caller cannot widen its own
    view by editing the request — dropping the customer filter falls back to the
    grant, not to everything.
    """
    return await sales_data_service.dashboard(caller.access, filters.to_rpc_args())
