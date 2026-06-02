from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List

from app.db.session import get_db
from app.schemas.template import TemplateCreate, TemplateResponse, TemplateUpdate
from app.crud import crud_template
from app.api.auth import get_current_user, verify_admin_role
from app.models.template import ReportTemplate
from app.models.purchase import Purchase
from app.models.user import User

router = APIRouter(prefix="/templates", tags=["Report Templates"])

@router.get("/", response_model=List[TemplateResponse])
def read_templates(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """
    Получение списка шаблонов:
    - Админ видит абсолютно все шаблоны (включая черновики и заархивированные)
    - Пользователь видит только публичные неархивные шаблоны ИЛИ те, которые он лично купил
    """
    try:
        # 1. Если запрашивает АДМИНИСТРАТОР — отдаем всё для панели управления
        if current_user.role_id == 1:
            return crud_template.get_all_templates(db, skip=skip, limit=limit)
        
        # 2. Если запрашивает ОБЫЧНЫЙ ПОЛЬЗОВАТЕЛЬ:
        # Делаем JOIN с таблицей покупок, чтобы вытащить купленные архивные шаблоны
        templates = db.query(ReportTemplate).join(
            Purchase, 
            Purchase.template_id == ReportTemplate.id, 
            isouter=True  # LEFT JOIN, чтобы не отсечь шаблоны без покупок
        ).filter(
            or_(
                # Витрина магазина: общедоступные и не заархивированные
                (ReportTemplate.is_public == True) & (ReportTemplate.is_archived == False),
                
                # Личная библиотека: пользователь купил этот шаблон (даже если он в архиве)
                Purchase.user_id == current_user.id
            )
        ).offset(skip).limit(limit).distinct().all()
        
        return templates
        
    except Exception as e:
        import sys
        print(f"!!! КРИТИЧЕСКАЯ ОШИБКА В РОУТЕРЕ ТЕМПЛЕЙТОВ: {str(e)}", file=sys.stderr)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Ошибка сервера при сборке каталога: {str(e)}"
        )
    
@router.get("/{template_id}", response_model=TemplateResponse)
def read_template(template_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    template = crud_template.get_template(db, template_id=template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.post("/", response_model=TemplateResponse)
def create_new_template(template_in: TemplateCreate, db: Session = Depends(get_db), admin = Depends(verify_admin_role)):
    """Сохранение нового шаблона, спроектированного в Figma-подобном холсте"""
    return crud_template.create_template(db=db, template_in=template_in)

@router.put("/{template_id}", response_model=TemplateResponse)
def update_existing_template(template_id: int, template_in: TemplateUpdate, db: Session = Depends(get_db), admin = Depends(verify_admin_role)):
    template = crud_template.update_template(db=db, template_id=template_id, template_in=template_in)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.delete("/{template_id}")
def delete_existing_template(
    template_id: int, 
    db: Session = Depends(get_db), 
    admin = Depends(verify_admin_role)
):
    print(f"\n=== НАЧАЛО ОТЛАДКИ УДАЛЕНИЯ ШАБЛОНА {template_id} ===")
    
    template = crud_template.get_template(db, template_id=template_id)
    if not template:
        print(f"[-] Шаблон {template_id} не найден в базе данных.")
        raise HTTPException(status_code=404, detail="Template not found")

    purchases_count = len(template.purchases)
    print(f"[+] Шаблон найден: '{template.title}'")
    print(f"[+] Количество активных покупок/владельцев: {purchases_count}")
    print(f"[+] Текущий статус до изменения -> is_public: {template.is_public}, is_archived: {template.is_archived}")

    if purchases_count > 0:
        print("[!] Сценарий А: Шаблон куплен. Запускаем мягкое архивирование...")
        try:
            template.is_public = False
            template.is_archived = True
            
            db.add(template) 
            db.commit()
            
            db.refresh(template)
            print(f"[✅] Изменения успешно закомичены в БД!")
            print(f"[✅] Статус после refresh -> is_public: {template.is_public}, is_archived: {template.is_archived}")
        except Exception as db_err:
            print(f"[❌] Ошибка при сохранении изменений (commit/refresh): {str(db_err)}")
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Ошибка БД: {str(db_err)}")
        
        print("=== КОНЕЦ ОТЛАДКИ (АРХИВАЦИЯ СРАБОТАЛА) ===\n")
        return {
            "status": "success", 
            "detail": "Template has active owners. It has been archived and hidden from the store."
        }
    
    print("[!] Сценарий Б: Шаблон никто не покупал. Запускаем физическое удаление...")
    success = crud_template.delete_template(db=db, template_id=template_id)
    print(f"[+] Результат физического удаления из CRUD: {success}")
    print("=== КОНЕЦ ОТЛАДКИ (ФИЗИЧЕСКОЕ УДАЛЕНИЕ) ===\n")
    
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
        
    return {
        "status": "success", 
        "detail": "Template had no owners and was physically deleted."
    }

# 1. Ручка для публикации шаблона в общий каталог
@router.patch("/{template_id}/publish", response_model=TemplateResponse)
def publish_template_to_catalog(
    template_id: int, 
    db: Session = Depends(get_db), 
    admin = Depends(verify_admin_role)
):
    """Админ переводит шаблон в статус публичного, и он появляется в каталоге"""
    template = crud_template.get_template(db, template_id=template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    template.is_public = True
    template.is_archived = False  # При публикации убираем из архива, если он там был
    db.commit()
    db.refresh(template)
    return template

# 2. Ручка для скрытия шаблона из общего каталога обратно в черновики
@router.patch("/{template_id}/unpublish", response_model=TemplateResponse)
def unpublish_template_from_catalog(
    template_id: int, 
    db: Session = Depends(get_db), 
    admin = Depends(verify_admin_role)
):
    """Админ скрывает шаблон из каталога (делает приватным черновиком)"""
    template = crud_template.get_template(db, template_id=template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    template.is_public = False
    db.commit()
    db.refresh(template)
    return template

# 3. Предоставить доступ к отчету конкретному пользователю
@router.post("/{template_id}/grant-access")
def grant_private_access(
    template_id: int, 
    user_email: str, 
    db: Session = Depends(get_db), 
    admin = Depends(verify_admin_role)
):
    """
    Админ вводит email пользователя, и бэкенд создает запись в таблице Purchase.
    """
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким email не найден")
        
    template = crud_template.get_template(db, template_id=template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
        
    existing_access = db.query(Purchase).filter(
        Purchase.template_id == template_id,
        Purchase.user_id == user.id
    ).first()
    
    if existing_access:
        return {"status": "success", "detail": "У пользователя уже есть доступ к этому отчету"}
        
    new_access = Purchase(
        template_id=template_id,
        user_id=user.id
    )
    
    db.add(new_access)
    db.commit()
    
    return {"status": "success", "detail": f"Доступ к отчету успешно предоставлен для {user_email}"}