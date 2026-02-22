
export const PERMISSIONS = {
  // --- DASHBOARD ---
  DASHBOARD: {
    VIEW: 'view_dashboard',
    VIEW_MAP: 'view_map',
    VIEW_DATA_GRID: 'view_data_grid',
    MANAGE_HUBS: 'manage_distribution_hubs',
    SELECT_REGION: 'select_regional_territory',
    RUN_ANALYSIS: 'run_analysis',
    EXPORT_DATA: 'export_data',
  },

  // --- USER MANAGEMENT ---
  USER_MANAGEMENT: {
    VIEW: 'view_user_management',
    CREATE_USERS: 'create_users',
    EDIT_USERS: 'edit_users',
    DELETE_USERS: 'delete_users',
    MANAGE_GROUPS: 'manage_groups',
    CHANGE_PASSWORDS: 'change_passwords',
    MANAGE_PRESETS: 'manage_presets',
  },

  // --- CITY MANAGEMENT ---
  CITY_MANAGEMENT: {
    VIEW: 'view_city_management',
    CREATE_CITIES: 'create_cities',
    EDIT_CITIES: 'edit_cities',
    DELETE_CITIES: 'delete_cities',
  },

  // --- CITY THRESHOLDS ---
  CITY_THRESHOLDS: {
    VIEW: 'view_city_thresholds',
    MANAGE: 'manage_thresholds',
  },

  // --- ACTIVITY LOGS ---
  AUDIT_LOGS: {
    VIEW: 'view_audit_logs',
  },

  // --- TICKETS ---
  TICKETS: {
    VIEW: 'view_tickets',
    CREATE: 'create_tickets',
    MANAGE: 'manage_tickets',
  },

  // --- ADMIN TOOLS ---
  ADMIN_TOOLS: {
    VIEW: 'view_admin_tools',
    BATCH_PROCESSOR: 'tool_batch_processor',
    DARK_STORE_ANALYZER: 'tool_dark_store_analyzer',
    TOPOLOGY_ARCHITECT: 'tool_topology_architect',
    MAP_ARCHITECT: 'tool_map_architect',
    DATA_SCRAPER: 'tool_data_scraper',
    TEAM_ACCESS_MANAGER: 'tool_team_access_manager', // Note: This might overlap with USER_MANAGEMENT if intended as the same page
    COORDINATE_FLIPPER: 'tool_coordinate_flipper',
    BROADCAST_CENTER: 'tool_broadcast_center',
  },

  // --- DOCUMENTATION ---
  DOCUMENTATION: {
    VIEW: 'view_documentation',
  },
};

// Helper to flatten permissions for easier checking
export const ALL_PERMISSIONS_LIST = Object.values(PERMISSIONS).flatMap(group => Object.values(group));

export type PermissionKey = typeof ALL_PERMISSIONS_LIST[number];

// Helper to check if a user has a permission
// If user is admin, they have ALL permissions.
export const hasPermission = (user: any, permission: string): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.permissions?.[permission] === true;
};

// Configuration for the UI to render checkboxes
export const PERMISSION_GROUPS_UI = [
  {
    category: "Dashboard & Operations",
    permissions: [
      { id: PERMISSIONS.DASHBOARD.VIEW, label: "View Dashboard Page" },
      { id: PERMISSIONS.DASHBOARD.VIEW_MAP, label: "View Map" },
      { id: PERMISSIONS.DASHBOARD.VIEW_DATA_GRID, label: "View Data Grid" },
      { id: PERMISSIONS.DASHBOARD.MANAGE_HUBS, label: "Manage Distribution Hubs" },
      { id: PERMISSIONS.DASHBOARD.SELECT_REGION, label: "Select Regional Territory" },
      { id: PERMISSIONS.DASHBOARD.RUN_ANALYSIS, label: "Run Analysis" },
      { id: PERMISSIONS.DASHBOARD.EXPORT_DATA, label: "Export Data" },
    ]
  },
  {
    category: "User Management",
    permissions: [
      { id: PERMISSIONS.USER_MANAGEMENT.VIEW, label: "View User Management Page" },
      { id: PERMISSIONS.USER_MANAGEMENT.CREATE_USERS, label: "Create Users" },
      { id: PERMISSIONS.USER_MANAGEMENT.EDIT_USERS, label: "Edit Users" },
      { id: PERMISSIONS.USER_MANAGEMENT.DELETE_USERS, label: "Delete Users" },
      { id: PERMISSIONS.USER_MANAGEMENT.MANAGE_GROUPS, label: "Manage Groups" },
      { id: PERMISSIONS.USER_MANAGEMENT.CHANGE_PASSWORDS, label: "Change User Passwords" },
      { id: PERMISSIONS.USER_MANAGEMENT.MANAGE_PRESETS, label: "Manage Permission Presets" },
    ]
  },
  {
    category: "City Management",
    permissions: [
      { id: PERMISSIONS.CITY_MANAGEMENT.VIEW, label: "View City Management Page" },
      { id: PERMISSIONS.CITY_MANAGEMENT.CREATE_CITIES, label: "Create Cities" },
      { id: PERMISSIONS.CITY_MANAGEMENT.EDIT_CITIES, label: "Edit Cities" },
      { id: PERMISSIONS.CITY_MANAGEMENT.DELETE_CITIES, label: "Delete Cities" },
    ]
  },
  {
    category: "City Thresholds",
    permissions: [
      { id: PERMISSIONS.CITY_THRESHOLDS.VIEW, label: "View Thresholds Page" },
      { id: PERMISSIONS.CITY_THRESHOLDS.MANAGE, label: "Manage Thresholds" },
    ]
  },
  {
    category: "Tickets & Support",
    permissions: [
      { id: PERMISSIONS.TICKETS.VIEW, label: "View Tickets Page" },
      { id: PERMISSIONS.TICKETS.CREATE, label: "Create Tickets" },
      { id: PERMISSIONS.TICKETS.MANAGE, label: "Manage Tickets (Resolve/Delete)" },
    ]
  },
  {
    category: "Activity Logs",
    permissions: [
      { id: PERMISSIONS.AUDIT_LOGS.VIEW, label: "View Activity Logs" },
    ]
  },
  {
    category: "Admin Tools",
    permissions: [
      { id: PERMISSIONS.ADMIN_TOOLS.VIEW, label: "View Admin Tools Page" },
      { id: PERMISSIONS.ADMIN_TOOLS.BATCH_PROCESSOR, label: "Batch Coverage Processor" },
      { id: PERMISSIONS.ADMIN_TOOLS.DARK_STORE_ANALYZER, label: "Dark Store Analyzer" },
      { id: PERMISSIONS.ADMIN_TOOLS.TOPOLOGY_ARCHITECT, label: "Topology Architect" },
      { id: PERMISSIONS.ADMIN_TOOLS.MAP_ARCHITECT, label: "Map Architect" },
      { id: PERMISSIONS.ADMIN_TOOLS.DATA_SCRAPER, label: "Data Scraper" },
      { id: PERMISSIONS.ADMIN_TOOLS.TEAM_ACCESS_MANAGER, label: "Team Access Manager" },
      { id: PERMISSIONS.ADMIN_TOOLS.COORDINATE_FLIPPER, label: "Coordinate Flipper" },
      { id: PERMISSIONS.ADMIN_TOOLS.BROADCAST_CENTER, label: "Broadcast Center" },
    ]
  },
  {
    category: "Documentation",
    permissions: [
      { id: PERMISSIONS.DOCUMENTATION.VIEW, label: "View Documentation" },
    ]
  },
];
