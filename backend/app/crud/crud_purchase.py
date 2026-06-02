from sqlalchemy.orm import Session
from app.models.purchase import Purchase
from app.schemas.purchase import PurchaseCreate

def get_user_purchases(db: Session, user_id: int):
    return db.query(Purchase).filter(Purchase.user_id == user_id).all()

def check_user_has_template(db: Session, user_id: int, template_id: int) -> bool:
    purchase = db.query(Purchase).filter(
        Purchase.user_id == user_id, 
        Purchase.template_id == template_id
    ).first()
    return purchase is not None

def create_purchase(db: Session, purchase_in: PurchaseCreate, user_id: int):
    db_purchase = Purchase(
        user_id=user_id,
        template_id=purchase_in.template_id,
        status="completed" # Имитация транзакции
    )
    db.add(db_purchase)
    db.commit()
    db.refresh(db_purchase)
    return db_purchase