import json
import os
import re
import asyncio
import edge_tts

async def generate_audio_for_chapter(text, output_file, voice="vi-VN-HoaiMyNeural"):
    print(f"Đang tạo audio: {output_file} (Voice: {voice})")
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)
    print(f"Hoàn thành: {output_file}")

def clean_html(raw_html):
    # Thay thế <h2> và <p> bằng khoảng trắng để tránh dính chữ
    text = re.sub(r'</?(h2|p)[^>]*>', ' ', raw_html)
    # Xóa các tag html khác
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', text)
    # Xóa khoảng trắng thừa
    cleantext = re.sub(r'\s+', ' ', cleantext).strip()
    return cleantext

async def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    for vol in range(1, 2):
        print(f"\n=== XỬ LÝ AUDIO TẬP {vol} ===")
        json_path = os.path.join(script_dir, "..", "web", "data", f"volume_{vol}", "book_config.json")
        audio_dir = os.path.join(script_dir, "..", "web", "audio", f"volume_{vol}")
        
        if not os.path.exists(json_path):
            print(f"Bỏ qua tập {vol} vì chưa có file cấu hình.")
            continue
            
        os.makedirs(audio_dir, exist_ok=True)
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        pages = data['pages']
        chapters = data['chapters']
        
        # Tạo dictionary map page_number -> content
        page_content_map = {p['page_number']: p['content'] for p in pages}
        
        for i, chapter in enumerate(chapters):
            start_page = chapter['start_page']
            end_page = chapters[i+1]['start_page'] - 1 if i + 1 < len(chapters) else pages[-1]['page_number']
            
            chapter_html = ""
            for page_num in range(start_page, end_page + 1):
                if page_num in page_content_map:
                    chapter_html += page_content_map[page_num] + " "
                    
            chapter_text = clean_html(chapter_html)
            
            # Thêm tiêu đề chương vào đầu để TTS đọc tiêu đề
            chapter_text = f"{chapter['title']}. " + chapter_text
            
            # Bỏ qua những chương quá ngắn
            if len(chapter_text) < 50 and chapter_text.count(' ') < 10:
                print(f"Bỏ qua chương {chapter['chapter_id']} vì nội dung quá ngắn: {chapter['title']}")
                continue
                
            output_mp3 = os.path.join(audio_dir, f"ch_{chapter['chapter_id']}.mp3")
            
            # Nếu file đã tồn tại, bỏ qua để tiết kiệm thời gian
            if os.path.exists(output_mp3):
                print(f"File đã tồn tại, bỏ qua: {output_mp3}")
                continue
                
            await generate_audio_for_chapter(chapter_text, output_mp3)

if __name__ == "__main__":
    asyncio.run(main())

