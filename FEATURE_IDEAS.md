# Feature Ideas for Hyperlapse.js

Based on an analysis of the repository, here are three feature ideas that would significantly enhance the library's capabilities and user experience.

## 1. Cross-Fade Transitions for Smoother Playback
**Problem:** The current animation implementation hard-cuts between panoramas (`mesh.material.map.image = ...`). Because Street View images are discrete and often spaced several meters apart, this creates a jerky, slideshow-like effect, especially at lower frame rates or larger step distances.

**Solution:** Implement a cross-fade transition system.
- **Implementation:** Modify the Three.js rendering logic to support two textures simultaneously (current and next). Use a custom shader or two concentric spheres with varying opacity to blend between frames over a short duration.
- **Benefit:** This would create a "ghosting" or motion-blur effect that bridges the gap between frames, resulting in a much smoother, fluid video experience that mimics actual video footage rather than a series of photos.

## 2. Camera Heading Stabilization (Look-Ahead Smoothing)
**Problem:** When `use_lookat` is disabled, the camera's heading is derived directly from the path segments (`computeHeading(a, b)`). This causes the camera to snap abruptly at every turn and transmit any "jitter" from the GPS path directly to the viewer, resulting in shaky footage.

**Solution:** Implement a heading stabilization algorithm.
- **Implementation:** Instead of snapping to the instantaneous course of the current segment, calculate a weighted moving average (or B-spline) of the heading over a window of frames (e.g., +/- 3 frames).
- **Benefit:** The camera would lazily follow the path, smoothing out sharp turns and eliminating GPS jitter. This would give the hyperlapse a professional, cinematic "steadicam" feel.

## 3. Streaming / Infinite Route Support
**Problem:** The current implementation (`loader.composePanorama`) pre-loads *all* panorama tiles for the entire route into `<canvas>` elements before playback can begin. This leads to high memory usage and limits the maximum length of a hyperlapse (typically < 200 frames) before the browser crashes or runs out of memory.

**Solution:** Implement a lazy-loading or streaming buffer system.
- **Implementation:** Refactor the loader to only keep a sliding window of decoded frames in memory (e.g., current frame +/- 20 frames). As playback progresses, dynamically fetch and compose upcoming panoramas and discard old ones.
- **Benefit:** This would allow for virtually infinite hyperlapse durations (e.g., coast-to-coast trips) without memory constraints, making the tool viable for much longer and more ambitious projects.
