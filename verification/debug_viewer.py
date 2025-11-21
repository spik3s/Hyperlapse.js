from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        print("Navigating to viewer.html...")
        page.goto("http://localhost:5173/examples/viewer.html")

        # Wait for a bit to let scripts run
        time.sleep(5)

        browser.close()

if __name__ == "__main__":
    run()
