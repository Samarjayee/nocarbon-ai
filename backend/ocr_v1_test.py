import pytesseract
from PIL import Image
import re
import easyocr
from typing import Dict, Optional

#TODO add sonnet and microsoft openvision models
def perform_ocr(image_path: str) -> str:
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img)
        
        if text.strip():
            print("OCR successful with Tesseract.")
            return text
        else:
            print("Tesseract failed to extract meaningful text. Falling back to EasyOCR...")
    except Exception as e:
        print(f"Error during Tesseract OCR: {e}. Falling back to EasyOCR...")

    # Fallback to EasyOCR
    try:
        reader = easyocr.Reader(['en'], gpu=False)  
        result = reader.readtext(image_path, detail=0)  
        text = "\n".join(result)
        
        if text.strip():
            print("OCR successful with EasyOCR.")
            return text
        else:
            print("EasyOCR also failed to extract meaningful text.")
            return ""
    except Exception as e:
        print(f"Error during EasyOCR: {e}")
        return ""

def extract_bill_info(text: str) -> Dict[str, Optional[str]]:
    """ FUNC Extracting potentially useful information from bill text for carbon emission analysis."""
    #TODO adding all the important factors to extract from the bill
    bill_info = {
        "date": None,
        "total_amount": None,
        "items": [],
        "quantities": [],
        "store_name": None,
        "energy_keywords": None  
    }

    #TODO Common patterns will require to study the bils to config this
    date_pattern = r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b"
    amount_pattern = r"\b(?:total|amount|due)\s*[:=]?\s*\$?(\d+\.?\d{0,2})\b"
    item_pattern = r"^[A-Za-z\s]+[\d\.]+$"  
    quantity_pattern = r"\b(\d+)\s*(?:x|qty|quantity)\b"
    store_pattern = r"^[A-Za-z\s&]+(?:Inc|Corp|Ltd)?$"  

    lines = text.split("\n")

    energy_keywords = ["electricity", "gas", "fuel", "kwh", "kw", "kilowatt", "liters", "gallons"]
    found_keywords = []

    for line in lines:
        line = line.strip().lower()
        date_match = re.search(date_pattern, line)
        if date_match and not bill_info["date"]:
            bill_info["date"] = date_match.group(0)

        amount_match = re.search(amount_pattern, line)
        if amount_match and not bill_info["total_amount"]:
            bill_info["total_amount"] = amount_match.group(1)

        if re.match(item_pattern, line.strip()):
            bill_info["items"].append(line.strip())

        qty_match = re.search(quantity_pattern, line)
        if qty_match:
            bill_info["quantities"].append(qty_match.group(1))

        store_match = re.match(store_pattern, line.strip())
        if store_match and not bill_info["store_name"] and len(line.split()) > 1:
            bill_info["store_name"] = store_match.group(0)

        for keyword in energy_keywords:
            if keyword in line and keyword not in found_keywords:
                found_keywords.append(keyword)

    if found_keywords:
        bill_info["energy_keywords"] = ", ".join(found_keywords)

    return bill_info

def process_bill_image(image_path: str) -> None:
    extracted_text = perform_ocr(image_path)
    
    if not extracted_text:
        print("No text extracted from the image.")
        return
    print(extracted_text)
    bill_info = extract_bill_info(extracted_text)
    for key, value in bill_info.items():
        if value:
            print(f"{key.replace('_', ' ').title()}: {value}")
        else:
            print(f"{key.replace('_', ' ').title()}: Not found")

if __name__ == "__main__":
    image_path = "/bill.jpg" 
    process_bill_image(image_path)