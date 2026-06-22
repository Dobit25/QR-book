import http.server
import socketserver
import os

PORT = 8080

class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        if 'Range' not in self.headers:
            self.range = None
            return super().send_head()
            
        try:
            self.range = self.headers['Range']
            parts = self.range.replace("bytes=", "").split("-")
            self.start = int(parts[0])
            self.end = int(parts[1]) if parts[1] else None
        except:
            return super().send_head()

        path = self.translate_path(self.path)
        f = None
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(http.HTTPStatus.NOT_FOUND, "File not found")
            return None

        try:
            fs = os.fstat(f.fileno())
            file_len = fs.st_size
            
            if self.end is None or self.end >= file_len:
                self.end = file_len - 1
                
            length = self.end - self.start + 1
            
            self.send_response(http.HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-type", self.guess_type(path))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {self.start}-{self.end}/{file_len}")
            self.send_header("Content-Length", str(length))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            
            f.seek(self.start)
            return f
        except:
            f.close()
            raise

    def copyfile(self, source, outputfile):
        if not hasattr(self, 'range') or self.range is None:
            return super().copyfile(source, outputfile)
            
        length = self.end - self.start + 1
        buf_size = 64 * 1024
        while length > 0:
            chunk = source.read(min(length, buf_size))
            if not chunk:
                break
            outputfile.write(chunk)
            length -= len(chunk)

Handler = RangeRequestHandler

# Chuyển directory vào thư mục web để host
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web'))

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Bắt đầu server hỗ trợ TUA AUDIO tại http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
