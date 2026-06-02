from sqlalchemy.orm import Session
from app.models.template import ReportTemplate, TemplateParameter
from app.schemas.template import TemplateCreate, TemplateUpdate

def get_template(db: Session, template_id: int):
    return db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()

def get_public_templates(db: Session, skip: int = 0, limit: int = 100):
    # Запрашиваем из базы только по полю is_public
    templates = db.query(ReportTemplate).filter(ReportTemplate.is_public == True).offset(skip).limit(limit).all()
    # Фильтруем архивные средствами Python на случай, если колонки нет в SQL
    return [t for t in templates if not getattr(t, "is_archived", False)]

def get_all_templates(db: Session, skip: int = 0, limit: int = 100):
    # Запрашиваем вообще все записи из таблицы
    templates = db.query(ReportTemplate).offset(skip).limit(limit).all()
    # Фильтруем архивные средствами Python
    return [t for t in templates if not getattr(t, "is_archived", False)]

def create_template(db: Session, template_in: TemplateCreate):
    db_template = ReportTemplate(
        title=template_in.title,
        description=template_in.description,
        layout_json=template_in.layout_json,
        price=template_in.price,
        is_public=template_in.is_public
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)

    # Сохраняем связанные параметры шаблона
    for param in template_in.parameters:
        db_param = TemplateParameter(**param.model_dump(), template_id=db_template.id)
        db.add(db_param)
    db.commit()
    db.refresh(db_template)
    return db_template

def update_template(db: Session, template_id: int, template_in: TemplateUpdate):
    db_template = db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()
    if not db_template:
        return None
    
    update_data = template_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_template, key, value)
        
    db.commit()
    db.refresh(db_template)
    return db_template

def delete_template(db: Session, template_id: int):
    db_template = db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()
    if db_template:
        db.delete(db_template)
        db.commit()
        return True
    return False