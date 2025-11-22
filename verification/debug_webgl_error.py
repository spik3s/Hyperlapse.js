import time
from playwright.sync_api import sync_playwright

def debug_webgl_error():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True) # WebGL errors might need headful? No, Chrome usually logs them.
        # Note: Headless Chrome might not have a real GPU, so WebGL behavior varies.
        # But "glCopySubTextureCHROMIUM" is specific to Chrome's command buffer.

        context = browser.new_context()
        page = context.new_page()

        # Capture console logs
        logs = []
        def on_console(msg):
            logs.append(msg.text)
            if "GL_INVALID_VALUE" in msg.text:
                print(f"CAUGHT ERROR: {msg.text}")

        page.on("console", on_console)

        page.goto("http://localhost:5173/examples/viewer.html")

        # Wait for initial load
        try:
            page.wait_for_selector("#text:has-text('Ready.')", timeout=30000)
            print("Initial load complete.")
        except:
            print("Timeout waiting for initial load.")

        # Change Zoom to 2
        # Access the zoom input.
        zoom_row = page.locator("li.cr.number", has_text="zoom")
        if zoom_row.count() > 0:
            inp = zoom_row.locator("input")
            inp.fill("2")
            inp.press("Enter")
            print("Set zoom to 2.")
        else:
            print("Zoom control not found.")
            return

        # Click Generate
        gen_btn = page.locator("li.cr.function", has_text="generate").locator(".button")
        gen_btn.click()
        print("Clicked Generate.")

        # Wait for load
        try:
            page.wait_for_selector("#text:has-text('Loading:')", timeout=10000)
            page.wait_for_selector("#text:has-text('Ready.')", timeout=60000)
            print("Second load complete.")
        except:
            print("Timeout waiting for second load.")

        # Check logs
        found_error = False
        for log in logs:
            if "GL_INVALID_VALUE" in log or "overflows texture dimensions" in log:
                found_error = True
                print(f"Found WebGL error: {log}")

        if not found_error:
            print("No WebGL errors found.")

        browser.close()

if __name__ == "__main__":
    debug_webgl_error()
