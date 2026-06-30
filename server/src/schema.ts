export const typeDefs = /* GraphQL */ `
  scalar Date

  enum Position {
    FE
    BE
    QA
    PM
    FULLSTACK
    ALL
  }

  enum LeaveType {
    CUTI
    SAKIT
    IZIN
  }

  type User {
    id: ID!
    email: String!
    name: String!
    isAdmin: Boolean!
    isGuest: Boolean
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Squad {
    id: ID!
    name: String!
    # Per-squad JIRA board id / project key (optional). Credentials are global (env).
    defaultBoardId: String
    spFieldDefault: String
    spFieldFE: String
    spFieldBE: String
    spFieldQA: String
    # Per-squad Confluence export target (fallback: global env).
    confluenceSpaceKey: String
    confluenceParentId: String
    members: [TeamMember!]!
    sprints: [Sprint!]!
    holidays: [Holiday!]!
    # True when global JIRA credentials exist in the server environment.
    jiraConfigured: Boolean!
  }

  # Status of the global JIRA credentials (from server env). Secrets not exposed.
  type JiraEnv {
    configured: Boolean!
    baseUrl: String
    email: String
    defaultBoardId: String
  }

  type TeamMember {
    id: ID!
    name: String!
    fullName: String
    position: Position!
    jiraAccountId: String
    leaves: [Leave!]!
  }

  type Leave {
    id: ID!
    member: TeamMember!
    type: LeaveType!
    startDate: Date!
    endDate: Date!
    substitute: TeamMember
    note: String
  }

  type Holiday {
    id: ID!
    date: Date!
    name: String!
  }

  type Sprint {
    id: ID!
    number: Int!
    name: String
    startDate: Date!
    endDate: Date!
    confluenceUrl: String
    confluenceExportedAt: String
  }

  # Active sprint info pulled live from JIRA (board's active sprint).
  type JiraSprint {
    id: Int!
    number: Int
    name: String!
    startDate: Date
    endDate: Date
  }

  type JiraTicket {
    key: String!
    status: String
    assignee: String
    assigneeAccountId: String
    summary: String
    url: String!
    priority: String
    issueType: String
    epicKey: String
    epicName: String
    parentKey: String
    parentName: String
    parentType: String
    storyPoints: Float
    storyPointsFE: Float
    storyPointsBE: Float
    storyPointsQA: Float
    carryOver: Boolean
    carryOverCount: Int
    carryOverSprints: [String!]
  }

  type JiraField {
    id: String!
    name: String!
  }

  type JiraUser {
    accountId: String!
    displayName: String!
    email: String
  }

  # Public (no auth) name hints for the guest-login screen.
  type MemberSuggestion {
    name: String!
    fullName: String
  }

  type StandupEntry {
    id: ID!
    sprintId: ID!
    date: Date!
    ticketKey: String!
    ticketStatus: String
    ticketSummary: String
    ticketAssignee: String
    issueType: String
    storyPoints: Float
    epicKey: String
    epicName: String
    parentKey: String
    parentName: String
    carryOverCount: Int
    carryOverFrom: String
    feAssignee: String
    beAssignee: String
    qaAssignee: String
    feProgress: Int
    beProgress: Int
    qaProgress: Int
    updateText: String
    progress: Int!
    blockerNote: String
  }

  type StandupSession {
    sprintId: ID!
    leadName: String!
    active: Boolean!
    # True when the requesting client (by leadKey) is the current lead.
    isMine: Boolean!
    startedAt: String!
  }

  type StandupLog {
    id: ID!
    leadName: String!
    startedAt: String!
    endedAt: String!
    durationSec: Int!
  }

  type ActivityLog {
    id: ID!
    actor: String!
    ticketKey: String
    message: String!
    prevText: String
    newText: String
    createdAt: String!
  }

  type Blocker {
    id: ID!
    squadId: ID!
    sprintId: ID
    description: String!
    jiraTicket: String
    foundDate: Date!
    resolvedDate: Date
    note: String
    resolveNote: String
  }

  # A dashboard row groups all entries for one ticket on one date.
  type DashboardRow {
    date: Date!
    entry: StandupEntry
    ticket: JiraTicket
  }

  # --------------------------- Inputs ---------------------------
  input TeamMemberInput {
    name: String!
    fullName: String
    position: Position!
    jiraAccountId: String
  }

  input LeaveInput {
    memberId: ID!
    type: LeaveType
    startDate: Date!
    endDate: Date!
    substituteId: ID
    note: String
  }

  input HolidayInput {
    date: Date!
    name: String!
  }

  input SprintInput {
    number: Int!
    name: String
    startDate: Date!
    endDate: Date!
  }

  input StandupEntryInput {
    sprintId: ID!
    date: Date!
    ticketKey: String!
    ticketStatus: String
    ticketSummary: String
    ticketAssignee: String
    issueType: String
    storyPoints: Float
    epicKey: String
    epicName: String
    parentKey: String
    parentName: String
    carryOverCount: Int
    carryOverFrom: String
    feAssignee: String
    beAssignee: String
    qaAssignee: String
    feProgress: Int
    beProgress: Int
    qaProgress: Int
    updateText: String
    progress: Int
    blockerNote: String
  }

  input BlockerInput {
    sprintId: ID
    description: String!
    jiraTicket: String
    foundDate: Date!
    resolvedDate: Date
    note: String
    resolveNote: String
  }

  type Health {
    ok: Boolean!
    database: Boolean!
    jira: Boolean!
    time: String!
  }

  type Query {
    health: Health!
    me: User
    jiraEnv: JiraEnv!
    squads: [Squad!]!
    squad(id: ID!): Squad
    sprints(squadId: ID!): [Sprint!]!
    currentSprint(squadId: ID!): Sprint
    boardTickets(squadId: ID!, refresh: Boolean): [JiraTicket!]!
    activeSprintTickets(squadId: ID!, refresh: Boolean): [JiraTicket!]!
    jiraActiveSprint(squadId: ID!): JiraSprint
    standupEntries(sprintId: ID!): [StandupEntry!]!
    dashboard(sprintId: ID!, date: Date): [DashboardRow!]!
    blockers(squadId: ID!, includeResolved: Boolean): [Blocker!]!
    activityLog(squadId: ID!, limit: Int, offset: Int, search: String): [ActivityLog!]!
    activeStandup(sprintId: ID!, leadKey: String): StandupSession
    standupLogs(squadId: ID!, limit: Int, offset: Int): [StandupLog!]!
    exportHistory(sprintId: ID!): [ExportLog!]!
    # All JIRA fields (id + name) for the squad's board — helps admins pick the SP field.
    jiraFields(squadId: ID!): [JiraField!]!
    jiraUsers(squadId: ID!): [JiraUser!]!
    # Public: distinct team-member names for the guest-login name suggestion.
    memberSuggestions: [MemberSuggestion!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    # Guest access for running standup: no account, name only. Non-admin.
    guestLogin(name: String!): AuthPayload!

    createSquad(name: String!, defaultBoardId: String): Squad!
    updateSquad(
      id: ID!
      name: String
      defaultBoardId: String
      spFieldDefault: String
      spFieldFE: String
      spFieldBE: String
      spFieldQA: String
      confluenceSpaceKey: String
      confluenceParentId: String
    ): Squad!
    deleteSquad(id: ID!): Boolean!

    # Tests the global JIRA credentials from the server env (calls /myself).
    testJiraConfig: String!

    addMember(squadId: ID!, input: TeamMemberInput!): TeamMember!
    updateMember(id: ID!, input: TeamMemberInput!): TeamMember!
    deleteMember(id: ID!): Boolean!

    addLeave(input: LeaveInput!): Leave!
    deleteLeave(id: ID!): Boolean!

    addHoliday(squadId: ID!, input: HolidayInput!): Holiday!
    deleteHoliday(id: ID!): Boolean!

    createSprint(squadId: ID!, input: SprintInput!): Sprint!
    updateSprint(id: ID!, input: SprintInput!): Sprint!
    deleteSprint(id: ID!): Boolean!
    # Pull the board's active sprint from JIRA and upsert it as a local Sprint.
    syncActiveSprint(squadId: ID!): Sprint

    # Standup session lock. leadKey identifies the claiming client/tab.
    startStandup(sprintId: ID!, leadName: String!, leadKey: String!): StandupSession!
    standupHeartbeat(sprintId: ID!, leadKey: String!): Boolean!
    endStandup(sprintId: ID!, leadKey: String!): Boolean!

    saveStandupEntry(input: StandupEntryInput!, leadKey: String): StandupEntry!

    upsertBlocker(squadId: ID!, id: ID, input: BlockerInput!): Blocker!
    deleteBlocker(id: ID!): Boolean!

    # Admin only. Wipes all squads and their data (members, leaves, holidays,
    # sprints, standup entries, blockers, JIRA configs). Users are kept.
    # Pass reseedDefaults: true to recreate the Athens/Berlin/Cairo squads.
    resetDatabase(reseedDefaults: Boolean): Boolean!

    # Export a past sprint's standup report to a new Confluence page.
    exportSprintToConfluence(sprintId: ID!): ConfluenceExport!
  }

  type ConfluenceExport {
    url: String!
    title: String!
  }

  type ExportLog {
    id: ID!
    url: String!
    action: String!
    actor: String
    createdAt: String!
  }

  # Fired when a sprint's standup lock or any of its cells/blockers change.
  type StandupChange {
    sprintId: ID!
    kind: String!
  }

  type Subscription {
    standupChanged(sprintId: ID!): StandupChange!
  }
`;
