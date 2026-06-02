from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.schemas.purchase import PurchaseCreate, PurchaseResponse
from app.schemas.template import TemplateResponse  # Импортируем схему ответа шаблона
from app.crud import crud_purchase, crud_template
from app.api.auth import get_current_user
from app.models.template import ReportTemplate      # Импортируем саму модель шаблона
from app.models.purchase import Purchase          # Импортируем модель покупок

router = APIRouter(prefix="/purchases", tags=["Purchases (Mock)"])

@router.get("/", response_model=List[PurchaseResponse])
def get_my_purchases(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return crud_purchase.get_user_purchases(db, user_id=current_user.id)


@router.get("/my-templates", response_model=List[TemplateResponse])
def get_user_purchased_templates(
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """
    Возвращает список самих шаблонов отчетов, которые принадлежат пользователю.
    Игнорирует флаги скрытия и архивации — если куплено, отдаем всегда.
    """
    try:
        templates = db.query(ReportTemplate).join(
            Purchase, Purchase.template_id == ReportTemplate.id
        ).filter(
            Purchase.user_id == current_user.id
        ).all()
        
        return templates
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки личных шаблонов: {str(e)}")


@router.post("/", response_model=PurchaseResponse)
def buy_template(purchase_in: PurchaseCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Проверяем существование шаблона
    template = crud_template.get_template(db, template_id=purchase_in.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    # Проверяем, не куплен ли он уже
    if crud_purchase.check_user_has_template(db, user_id=current_user.id, template_id=purchase_in.template_id):
        raise HTTPException(status_code=400, detail="Template already purchased")
        
    return crud_purchase.create_purchase(db=db, purchase_in=purchase_in, user_id=current_user.id)