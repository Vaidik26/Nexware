"""
Sales Dashboard request/response schemas.

The filter model is an ALLOW-LIST, not a pass-through. The browser used to build
the RPC argument object itself and post it straight to the data source; here it
sends these fields and nothing else, and the backend builds the RPC call. A
proxy that forwarded whatever the client sent would let a caller add arguments
the endpoint never meant to expose — and would make the customer scope just
another field the client controls, which is the thing this endpoint exists to
stop.
"""
from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


class DashboardFilters(BaseModel):
    """One dashboard query, as the viewer selected it."""

    start: date
    end: date
    #: 'key' or 'van' as the RPC spells them, or None for both.
    channel: Optional[str] = Field(default=None, pattern="^(key|van)$")
    #: 'active' or 'inactive', or None for every SKU.
    active: Optional[str] = Field(default=None, pattern="^(active|inactive)$")
    products: Optional[List[str]] = None
    skus: Optional[List[str]] = None
    #: The customers the viewer filtered to. A REQUEST, not an instruction — the
    #: backend intersects it with the account's grant, so it can only narrow.
    customers: Optional[List[int]] = None

    @model_validator(mode="after")
    def _order_the_range(self) -> "DashboardFilters":
        """
        Swap a reversed range rather than refusing it.

        The custom-period picker lets either end be chosen first, and an
        inverted range returns nothing from the RPC — which reads as "no sales
        in this period" instead of "these dates are the wrong way round".
        """
        if self.start > self.end:
            object.__setattr__(self, "start", self.end)
            object.__setattr__(self, "end", self.start)
        return self

    def to_rpc_args(self) -> dict:
        """
        The RPC argument object. ``p_customers`` is filled in by the service
        after intersecting with the grant — never here.
        """
        return {
            "p_start": self.start.isoformat(),
            "p_end": self.end.isoformat(),
            "p_channel": self.channel,
            # The dashboard has no per-salesman filter; the RPC takes one and it
            # is always null. Named explicitly so the argument list matches the
            # function signature rather than relying on a default.
            "p_salesman": None,
            "p_active": self.active,
            "p_products": self.products or None,
            "p_skus": self.skus or None,
            "p_customers": self.customers,
        }
