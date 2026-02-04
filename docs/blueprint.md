# **App Name**: GeoCoverage Analyzer

## Core Features:

- User Authentication and Roles: Secure user authentication with role-based access control (Admin, Manager, Agent). Admin manages users and roles.
- City and Polygon Management: Admin uploads city polygons from CSV (Polygon ID, Polygon name, WKT). Agents choose the City from drop-down menu.
- Store Location Input: Input store coordinates; visualize location on a Leaflet/OSM map.
- Coverage Analysis: Analyzes which polygons a store can deliver to, based on admin-defined thresholds. Displays the polygons on a map. Polygon coloring changes as the travel time thresholds are exceeded.
- Threshold Configuration: Admin sets delivery thresholds (green limit, soft limit, hard cut-off) in kilometers for each city's polygons, based on OSRM real-life data.
- AI Coverage Analysis: AI tool analyzes the coverage results and suggests the best coverage options for a store, displayed in a table.
- Multi-Branch Analysis: Analyzes coverage for multiple branch locations, displaying each branch's coverage area with different polygon colors on the map.

## Style Guidelines:

- Primary color: Deep blue (#3F51B5) to convey trust and reliability, reminiscent of mapping services.
- Background color: Light gray (#F0F2F5), a desaturated near-tone of the primary, to ensure comfortable contrast and readability.
- Accent color: Teal (#009688), to draw the eye and denote points of interest.
- Font pairing: 'Inter' (sans-serif) for body text and 'Space Grotesk' (sans-serif) for headings. Note: currently only Google Fonts are supported.
- Use clear, modern icons to represent different actions and categories related to store management and location analysis.
- A clean and intuitive layout with a focus on map visualization. Use tabs or sections to organize the store input, map display, and coverage analysis results.
- Smooth transitions and animations when interacting with the map and analysis tools to provide a fluid user experience.