import fitz
import json
import os
import re
import unicodedata

def is_vni(text):
    vni_chars = ['ö', 'ï', 'û', 'ñ', 'æ', 'Ö', 'Ï', 'Û', 'Ñ', 'Æ', 'ä', 'å', 'ç', 'ë', 'î']
    for c in vni_chars:
        if c in text: return True
            
    vni_seqs = ['aâ', 'aá', 'aã', 'aä', 'aå', 'AÂ', 'AÁ', 'AÃ', 'AÄ', 'AÅ',
                'eâ', 'eá', 'eã', 'eä', 'eå', 'EÂ', 'EÁ', 'EÃ', 'EÄ', 'EÅ',
                'oä', 'OÄ', 'uä', 'UÄ',
                'yâ', 'yá', 'yã', 'yä', 'yå', 'YÂ', 'YÁ', 'YÃ', 'YÄ', 'YÅ',
                'êì', 'êë', 'êí', 'êî', 'êå', 'ÊÌ', 'ÊË', 'ÊÍ', 'ÊÎ', 'ÊÅ',
                'ùâ', 'ùá', 'ùã', 'ùä', 'ùå', 'ÙÂ', 'ÙÁ', 'ÙÃ', 'ÙÄ', 'ÙÅ']
    for seq in vni_seqs:
        if seq in text: return True

    if re.search(r'[aăâeêioôơuưyAĂÂEÊIOÔƠUƯY][áàảãạèéẻẽẹìíỉĩịòóỏõọùúủũụýỳỷỹỵ]', text):
        return True
        
    words = text.split()
    for w in words:
        if re.search(r'[aăâeêioôơuưyAĂÂEÊIOÔƠUƯY][bcdđghklmnpqrstvx]+[áàảãạèéẻẽẹìíỉĩịòóỏõọùúủũụýỳỷỹỵçëåäîæ]', w, re.IGNORECASE):
            return True
            
    if re.search(r'\b[àÀ][a-z]', text):
        return True
        
    return False

def fix_vni_word(word):
    base_map = {'ù': 'ă', 'Ù': 'Ă', 'ê': 'â', 'Ê': 'Â', 'ï': 'ê', 'Ï': 'Ê', 'ö': 'ô', 'Ö': 'Ô', 'ú': 'ơ', 'Ú': 'Ơ', 'û': 'ư', 'Û': 'Ư', 'à': 'đ', 'À': 'Đ'}
    tone_map = {'â': '\u0300', 'ì': '\u0300', 'ç': '\u0300', 'è': '\u0309', 'á': '\u0301', 'ë': '\u0301', 'æ': '\u0301', 'é': '\u0301', 'ã': '\u0309', 'í': '\u0309', 'ä': '\u0303', 'î': '\u0303', 'å': '\u0323', 'Â': '\u0300', 'Ì': '\u0300', 'Ç': '\u0300', 'È': '\u0309', 'Á': '\u0301', 'Ë': '\u0301', 'Æ': '\u0301', 'É': '\u0301', 'Ã': '\u0309', 'Í': '\u0309', 'Ä': '\u0303', 'Î': '\u0303', 'Å': '\u0323'}
    combined_map = {'ò': ('i', '\u0300'), 'Ò': ('I', '\u0300'), 'ñ': ('i', '\u0301'), 'Ñ': ('I', '\u0301'), 'ó': ('i', '\u0309'), 'Ó': ('I', '\u0309'), 'ô': ('i', '\u0303'), 'Ô': ('I', '\u0303'), 'õ': ('i', '\u0323'), 'Õ': ('I', '\u0323')}
    word = word.replace('iä', 'ĩ').replace('IÄ', 'Ĩ')
    
    tones, chars = [], []
    for c in word:
        if c in tone_map: tones.append(tone_map[c])
        elif c in combined_map:
            b, t = combined_map[c]
            chars.append(b)
            tones.append(t)
        elif c in base_map: chars.append(base_map[c])
        else: chars.append(c)
            
    base_word = ''.join(chars)
    if not tones: return base_word
        
    tone = tones[0]
    res = list(base_word)
    vowels = 'aăâeêioôơuưyAĂÂEÊIOÔƠUƯY'
    v_idx = [i for i, ch in enumerate(res) if ch in vowels]
    
    if not v_idx: return base_word + tone
        
    target_idx = v_idx[-1]
    if len(v_idx) > 1:
        last_v = res[v_idx[-1]].lower()
        prev_v = res[v_idx[-2]].lower()
        if last_v in 'iuy' or (last_v == 'a' and prev_v in 'iuư') or (last_v == 'o' and prev_v in 'aăâeêoôơ'):
            target_idx = v_idx[-2]
            if res[v_idx[-2]].lower() == 'u' and v_idx[-2] > 0 and res[v_idx[-2]-1].lower() == 'q':
                target_idx = v_idx[-1]
            elif res[v_idx[-2]].lower() == 'i' and v_idx[-2] > 0 and res[v_idx[-2]-1].lower() == 'g' and last_v != 'ư':
                target_idx = v_idx[-1]
                
    res[target_idx] = res[target_idx] + tone
    return unicodedata.normalize('NFC', ''.join(res))

def vni_to_unicode(text):
    if not text or not is_vni(text): return text
    text = re.sub(r'( +)([âìçáëæãíäîåÂÌÇÁËÆÃÍÄÎÅ])', r'\2\1', text)
    words = text.split(' ')
    merged = []
    for w in words:
        if not w:
            merged.append(w)
            continue
        if merged and merged[-1] != '' and re.match(r'^[bcdđghklmnpqrstvx]+[.,;!?:"\')]*$', w, re.IGNORECASE):
            merged[-1] = merged[-1] + w
        else:
            merged.append(w)
    return ' '.join(fix_vni_word(w) for w in merged if w)

def process_pdf(pdf_path, output_json_path, book_id, book_title):
    pages_data = []
    chapters_data = []
    
    current_chapter_title = "Lời Giới Thiệu"
    current_chapter_id = 1
    
    chapters_data.append({
        "chapter_id": current_chapter_id,
        "title": current_chapter_title,
        "start_page": 1,
        "audio_url": ""
    })
    
    img_dir = os.path.join(os.path.dirname(output_json_path), "pages")
    os.makedirs(img_dir, exist_ok=True)
    
    print(f"Đang đọc file PDF: {pdf_path}")
    doc = fitz.open(pdf_path)
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        
        # Capture Image
        pix = page.get_pixmap(dpi=150)
        img_filename = f"page_{page_num + 1}.jpg"
        img_filepath = os.path.join(img_dir, img_filename)
        pix.save(img_filepath)
        
        # Extract Text
        text = page.get_text("text")
        cleaned_lines = []
        
        if text:
            lines = [line.strip() for line in text.split("\n") if line.strip()]
            
            i = 0
            while i < len(lines):
                line = lines[i]
                
                # Skip headers/footers
                lower_line = line.lower()
                if "hạt giống tâm hồn" in lower_line and len(line) < 25:
                    i += 1
                    continue
                if "sống cho điều ý nghĩa hơn" in lower_line and len(line) < 40:
                    i += 1
                    continue
                if "first news" in lower_line and len(line) < 25:
                    i += 1
                    continue
                
                # Detect Chapter using Drop Cap + Number + Title
                if len(line) == 1 and line.isupper() and i + 2 < len(lines):
                    if re.match(r'^\d+$', lines[i+1]) or "lời giới thiệu" in lines[i+1].lower():
                        current_chapter_title = lines[i+2]
                        if "lời giới thiệu" in lines[i+1].lower():
                            current_chapter_title = "Lời Giới Thiệu"
                            
                        # Save new chapter
                        if not chapters_data or chapters_data[-1]["title"] != current_chapter_title:
                            current_chapter_id += 1
                            chapters_data.append({
                                "chapter_id": current_chapter_id,
                                "title": current_chapter_title,
                                "start_page": page_num + 1,
                                "audio_url": ""
                            })
                        
                        # Prepend drop cap to the first actual line of text
                        next_text_idx = i + 3
                        if "lời giới thiệu" in lines[i+1].lower():
                            # Skip the quote and author name
                            if "Nick Vujicic" in lines[i+3]:
                                next_text_idx = i + 4
                            elif i + 4 < len(lines) and "Nick Vujicic" in lines[i+4]:
                                next_text_idx = i + 5
                        
                        if next_text_idx < len(lines):
                            lines[next_text_idx] = line + lines[next_text_idx]
                            
                        i = next_text_idx
                        continue
                
                # Skip standalone numbers
                if re.match(r'^\d+$', line):
                    i += 1
                    continue
                
                cleaned_lines.append(line)
                i += 1
                
        # Join lines into paragraphs for TTS
        joined_paragraphs = []
        current_paragraph = ""
        for line in cleaned_lines:
            if current_paragraph:
                if not re.search(r'[.!?:"\']$', current_paragraph):
                    current_paragraph += " " + line
                else:
                    joined_paragraphs.append(current_paragraph)
                    current_paragraph = line
            else:
                current_paragraph = line
        if current_paragraph:
            joined_paragraphs.append(current_paragraph)
            
        page_content = " ".join(joined_paragraphs)
        
        pages_data.append({
            "page_number": page_num + 1,
            "image_url": f"data/volume_{book_id}/pages/{img_filename}",
            "content": page_content
        })
        
        if (page_num + 1) % 10 == 0:
            print(f"Đã xử lý trang {page_num + 1}/{len(doc)}")
            
    doc.close()
    
    output_data = {
        "book_id": book_id,
        "book_title": book_title,
        "chapters": chapters_data,
        "pages": pages_data
    }
    
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"Thành công! JSON đã được lưu tại: {output_json_path}")
    print(f"Tổng số trang: {len(pages_data)}")
    print(f"Tổng số chương phát hiện: {len(chapters_data)}")

if __name__ == "__main__":
    for vol in range(1, 2):
        pdf_file = rf"c:\Users\HOANG TUNG\QR-book\raw_pdfs\1. FILE_20230425_210449_Sống Cho Điều Ý Nghĩa Hơn.pdf"
        out_json = rf"c:\Users\HOANG TUNG\QR-book\web\data\volume_{vol}\book_config.json"
        
        if os.path.exists(pdf_file):
            print(f"\n=== BẮT ĐẦU XỬ LÝ TẬP {vol} ===")
            process_pdf(pdf_file, out_json, vol, f"Sống Cho Điều Ý Nghĩa Hơn")
        else:
            print(f"Không tìm thấy file: {pdf_file}")
