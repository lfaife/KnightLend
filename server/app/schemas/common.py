from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OK(APIModel):
    ok: bool = True
    message: str = ""


IdStr = PydanticObjectId
