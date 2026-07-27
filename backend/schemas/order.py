from pydantic import BaseModel, ConfigDict
from typing import Any, Dict, Optional
from datetime import datetime

class SalesOrderOut(BaseModel):
    id: int
    filename: str
    extracted_data: Dict[str, Any]
    status: str
    uploaded_at: datetime
    model_config = ConfigDict(from_attributes=True)
