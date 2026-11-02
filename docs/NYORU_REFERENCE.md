# Nyoru reference notes

Inspected the user-provided `E:\Nyoru-Personal-MCP-Relay-0.1.0-folder-fix\personal-relay-0.1.0` files without running the relay. The two Arca posts were unavailable to web fetching, and the browser safety policy blocked observing that site. The RPG plugin itself is not included in the downloaded relay folder, so these notes describe the relay only.

The relay is a dependency-free Node HTTP server. Browser HTML or plugins register tool definitions and handle incoming calls. An AI provider's MCP client discovers and calls those tools through the relay. Computation and game storage stay in the original plugin. The downloaded package explicitly says RPG and provider plugins must be obtained separately.

Publisher and consumer keys separate tool registration from tool calls. Registrations carry a contextId for the current document or chat, and changing context invalidates the old binding. Long polling delivers calls back to browser plugins, with cancellation, leases and bounded pending work. Closing the browser page or suspending it breaks that tool connection. The relay does not automatically discover arbitrary existing plugins.

Useful ideas for Warp are explicit operations with validated results, scoped to the active chat, and the original plugin owning the saved state. Warp already follows that pattern for its local resolver and chat metadata. A relay would add a process, keys and connection setup without improving the default install-and-play flow. No relay dependency or new MCP tool loop was added.

If the RPG plugin is inspected later, focus on how its choices lead to understandable consequences and how its interface reveals changes. The relay alone cannot demonstrate that gameplay loop or establish how much setup the RPG requires.
