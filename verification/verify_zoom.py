import time
from playwright.sync_api import sync_playwright, expect

def verify_zoom_control():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the viewer example
        page.goto("http://localhost:5173/examples/viewer.html")

        # Wait for the map and controls to load
        # We wait for .dg which is the class for dat.gui
        try:
            page.wait_for_selector(".dg.main", timeout=10000)
        except:
            print("dat.gui not found!")
            page.screenshot(path="verification/error_no_gui.png")
            browser.close()
            return

        print("dat.gui found.")

        # Open the parameters folder
        # dat.gui folders usually have a title
        parameters_folder = page.locator("li.folder", has_text="parameters")
        if parameters_folder.count() > 0:
             # Check if it's closed (usually has class 'closed' or similar)
             # If we want to ensure it's open, we can click the title
             # But the screenshot shows it's collapsed or empty?
             # The text in previous run showed "parameters", "distance_between_points", "max_points".
             # This implies the folder is OPEN.
             pass

        # Take a screenshot of the initial state
        page.screenshot(path="verification/initial_state.png")

        # Check for the text "zoom" in the entire page content to debug
        content = page.content()
        if "zoom" in content.lower(): # checking html source
             print("'zoom' string found in page source.")

        # We specifically want the dat.gui row
        # Sometimes dat.gui adds the property name as a label.
        # Let's look for the exact text "zoom" or "Zoom" inside .property-name

        zoom_row = page.locator(".property-name", has_text="zoom")
        if zoom_row.count() > 0:
            print("Zoom property name found.")
            # The input is usually a sibling or cousin.
            # .cr (controller row) -> div -> span.property-name
            #                      -> div.c -> input

            # Let's find the row that contains this property name
            row = page.locator("li.cr", has=page.locator(".property-name", has_text="zoom"))

            # Capture screenshot of just the gui
            page.locator(".dg.main").screenshot(path="verification/gui.png")

            # Try to change value if input exists
            inp = row.locator("input")
            if inp.count() > 0:
                inp.fill("3")
                inp.press("Enter")
                print("Zoom changed to 3.")
                page.screenshot(path="verification/zoom_changed.png")

            # If slider
            slider = row.locator(".slider")
            if slider.count() > 0:
                print("Zoom is a slider.")
                # Click somewhere on the slider
                slider.click()
                page.screenshot(path="verification/zoom_changed_slider.png")

        else:
            print("Zoom property name NOT found in GUI.")
            # Print all property names
            names = page.locator(".property-name").all_inner_texts()
            print("Properties found:", names)

        browser.close()

if __name__ == "__main__":
    verify_zoom_control()
