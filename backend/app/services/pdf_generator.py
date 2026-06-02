import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

def generate_report_pdf(filename: str, report_title: str, finance_data: dict, comment: str) -> str:
    """
    Генерирует PDF-отчёт на основе шаблона и данных из yfinance.
    """
    output_dir = os.path.dirname(filename)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # Регистрация стандартного шрифта (шрифты ОС используются для кириллицы)
    # Используем Helvetica или встроенные шрифты. Для полноценной кириллицы 
    # в реальной системе подгружается ttf файл, здесь настроена базовая разметка.
    doc = SimpleDocTemplate(filename, pagesize=letter,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=40)
    story = []
    styles = getSampleStyleSheet()
    
    # Стили текста
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#1A202C"),
        spaceAfter=15
    )
    
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#2D3748"),
        spaceBefore=15,
        spaceAfter=10
    )
    
    body_style = ParagraphStyle(
        'ReportBody',
        parent=styles['BodyText'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4A5568")
    )

    # 1. Заголовок отчёта
    story.append(Paragraph(f"Аналитический отчёт: {report_title}", title_style))
    story.append(Paragraph(f"Компания: {finance_data.get('company_name')} ({finance_data.get('ticker')})", section_style))
    story.append(Paragraph(f"Валюта активов: {finance_data.get('currency')} | Дата формирования: {finance_data.get('last_updated')[:10]}", body_style))
    story.append(Spacer(1, 15))

    # 2. Таблица с финансовыми показателями 
    story.append(Paragraph("Сводные данные по последним котировкам:", section_style))
    
    table_data = [["Дата", "Цена закрытия (Close)"]]
    dates = finance_data.get("dates", [])[-5:]
    prices = finance_data.get("prices", [])[-5:]
    
    for d, p in zip(dates, prices):
        table_data.append([d, f"{p} {finance_data.get('currency')}"])
        
    fin_table = Table(table_data, colWidths=[150, 200])
    fin_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#4A5568")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#F7FAFC")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
    ]))
    
    story.append(fin_table)
    story.append(Spacer(1, 20))

    story.append(Paragraph("Комментарии и выводы аналитика:", section_style))
    user_comment_text = comment if comment else "Пользовательские комментарии к данному срезу данных отсутствуют."
    story.append(Paragraph(user_comment_text, body_style))

    doc.build(story)
    return filename