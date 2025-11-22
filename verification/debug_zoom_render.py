import time
import base64
from playwright.sync_api import sync_playwright

def debug_zoom_render():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the viewer example
        page.goto("http://localhost:5173/examples/viewer.html")

        # Wait for dat.gui
        try:
            page.wait_for_selector(".dg.main", timeout=10000)
        except:
            print("dat.gui not found")
            return

        # Set Zoom to 2
        # We do this by evaluating JS directly to be faster/more reliable than UI interaction for debugging
        page.evaluate("""
            // Find the controller for zoom and setValue
            // The controller is inside dat.GUI
            // We can access the 'hyperlapse' object if it is global? No it is local in init.
            // But we can modify the input in the UI.

            const zoomInput = document.querySelector("li.cr.number:has(.property-name) input[type='text']");
            // Wait, we need to find the specific one.
            // Let's rely on the fact that we added it.

            // Better: Access the dat.gui controllers
            // We can't easily access the internal 'hyperlapse' variable unless we expose it.
            // But we can trigger the UI.
        """)

        # Let's try UI interaction again, but robustly.
        zoom_row = page.locator("li.cr.number", has_text="zoom")
        if zoom_row.count() > 0:
            inp = zoom_row.locator("input")
            inp.fill("2")
            inp.press("Enter")
            print("Set zoom to 2 via UI")
        else:
            print("Could not find Zoom UI")
            return

        # Click "Load"
        # The load button is likely in a function controller, which shows as a button.
        load_btn = page.locator("li.cr.function", has_text="load").locator(".button")
        load_btn.click()
        print("Clicked Load")

        # Wait for "Ready." text in the status div
        # text div id="text"
        # It says "Loading: X of Y" then "Ready."

        # Let's wait for "Loading:" first to ensure it started
        page.wait_for_selector("#text:has-text('Loading:')", timeout=10000)
        print("Loading started...")

        # Wait for "Ready."
        try:
            page.wait_for_selector("#text:has-text('Ready.')", timeout=60000)
            print("Loading complete.")
        except:
            print("Timed out waiting for loading to complete.")
            page.screenshot(path="verification/debug_timeout.png")
            # We might still have something loaded

        # Now extract the canvas from the hyperlapse
        # We can't access `hyperlapse` variable directly as it's inside a module type script
        # But we can grab the canvas from the DOM if it's there?
        # The viewer puts the WebGL canvas in the container.
        # But we want the *source* texture image (the composed panorama).

        # The texture is inside the Three.js material.
        # We can try to access the internal GSVPano canvas if we can reach the object.

        # Since we can't easily reach the module-scoped variable, let's look at the rendered output.
        page.screenshot(path="verification/zoom2_render_view.png")

        # Ideally we want the composed texture.
        # Maybe we can inject a script to expose it?
        # Or we can just verify if the screen looks like a panorama or a garbled mess.

        browser.close()

if __name__ == "__main__":
    debug_zoom_render()
