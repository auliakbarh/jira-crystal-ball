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
    # Tarot default story-point scale for this squad.
    tarotScaleType: String
    tarotScaleValues: String
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
    nextSprintTickets(squadId: ID!, refresh: Boolean): [JiraTicket!]!
    jiraActiveSprint(squadId: ID!): JiraSprint
    jiraNextSprint(squadId: ID!): JiraSprint
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

    # --- Tarot (planning poker) ---
    tarotRooms(squadId: ID!): [TarotRoomSummary!]!
    tarotRoom(id: ID!, key: String): TarotRoom
    tarotTickets(roomId: ID!, refresh: Boolean): [TarotTicket!]!
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
      tarotScaleType: String
      tarotScaleValues: String
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

    # --- Tarot (planning poker) ---
    # key = client-held token identifying the host/participant across reconnects.
    createTarotRoom(squadId: ID!, hostName: String!, hostKey: String!): TarotRoom!
    joinTarotRoom(roomId: ID!, name: String!, key: String!): TarotRoom!
    leaveTarotRoom(roomId: ID!, key: String!): Boolean!
    tarotHeartbeat(roomId: ID!, key: String!): Boolean!
    kickTarotParticipant(roomId: ID!, key: String!, participantId: ID!): Boolean!
    setTarotScale(roomId: ID!, key: String!, scaleType: String!, scaleValues: [Float!], setDefault: Boolean): TarotRoom!
    # Host starts (or restarts) a tarot session for a ticket.
    startTarotRound(roomId: ID!, key: String!, ticketKey: String!): TarotRound!
    # Guest selects/confirms a card. confirmed=false → preview (can still change).
    castTarotVote(roomId: ID!, key: String!, value: String!, confirmed: Boolean!): Boolean!
    # Host re-opens voting for the current ticket (cards reshuffle face-down).
    nextTarotCycle(roomId: ID!, key: String!): TarotRound!
    # Host forces the reveal early (needs at least one confirmed vote).
    forceRevealTarotRound(roomId: ID!, key: String!): TarotRound!
    # Host sets the ticket's story point + per-role points (each <= effort).
    decideTarotPoint(roomId: ID!, key: String!, effort: Float!, pointFE: Float, pointBE: Float, pointQA: Float): TarotResult!
    # Host: clear all decided points in the room (guarded by typing RESET client-side).
    resetTarotPoints(roomId: ID!, key: String!): Boolean!
    # Host (active room) or admin. Requires every next-sprint ticket to be pointed.
    endTarotRoom(roomId: ID!, key: String!): Boolean!
    # Host may delete an ACTIVE room; once ENDED only an admin can delete.
    deleteTarotRoom(roomId: ID!, key: String!): Boolean!
    # Host: write decided points to JIRA. fields = subset of ["point","fe","be","qa"].
    syncTarotToJira(roomId: ID!, key: String!, fields: [String!]!): TarotSyncResult!
    # Host: restore JIRA field values captured before the last sync.
    resetTarotSync(roomId: ID!, key: String!): Boolean!
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

  # --- Tarot (planning poker) types ---
  type TarotParticipant {
    id: ID!
    name: String!
    isHost: Boolean!
    online: Boolean!
    hasVoted: Boolean! # confirmed a card in the current round
    joinedAt: String!
  }

  # A revealed vote (participant name + chosen value). Only populated once the
  # round is REVEALED; before that only counts are exposed (so no peeking).
  type TarotVoteResult {
    participantId: ID!
    name: String!
    value: String!
  }

  type TarotRound {
    id: ID!
    ticketKey: String!
    ticketSummary: String
    ticketType: String
    ticketPriority: String
    ticketUrl: String
    status: String! # VOTING | REVEALED | DECIDED
    cycle: Int!
    createdAt: String! # round start time (for the elapsed timer)
    voteCount: Int! # confirmed votes so far
    revealed: Boolean!
    votes: [TarotVoteResult!]! # empty until revealed
    syncPercent: Int # team synchronization %, when revealed
    suggestion: String # most-picked value (null on a draw), when revealed
  }

  type TarotResult {
    ticketKey: String!
    ticketSummary: String
    parentKey: String
    parentName: String
    effort: Float!
    pointFE: Float
    pointBE: Float
    pointQA: Float
    decidedAt: String!
    syncedAt: String
  }

  # A next-sprint ticket as shown in a Tarot room, with its decided point (if any).
  type TarotTicket {
    key: String!
    summary: String
    issueType: String
    priority: String
    status: String
    url: String!
    parentKey: String
    parentName: String
    result: TarotResult
  }

  type TarotRoom {
    id: ID!
    squadId: ID!
    name: String!
    hostName: String!
    status: String! # ACTIVE | ENDED
    scaleType: String!
    scaleValues: [String!]! # deck values incl special "?" and "coffee"
    sprintName: String
    createdAt: String!
    endedAt: String
    isHost: Boolean! # true when the requesting key is the host
    viewerKicked: Boolean! # true when the requesting key was kicked from the room
    viewerVote: TarotViewerVote # the requester's own vote in the current round (for reload rehydrate)
    participants: [TarotParticipant!]!
    currentRound: TarotRound
    results: [TarotResult!]!
  }

  type TarotViewerVote {
    value: String!
    confirmed: Boolean!
  }

  # Lightweight row for the room landing list.
  type TarotRoomSummary {
    id: ID!
    name: String!
    hostName: String!
    status: String!
    createdAt: String!
    endedAt: String
    participantCount: Int!
  }

  type TarotSyncResult {
    updated: Int!
    tickets: [String!]!
    failed: [String!]!
  }

  # Fired when a sprint's standup lock or any of its cells/blockers change.
  type StandupChange {
    sprintId: ID!
    kind: String!
  }

  # Fired on any tarot room change (join/leave/vote/reveal/decided/…).
  type TarotRoomEvent {
    roomId: ID!
    kind: String!
    actor: String
  }

  type Subscription {
    standupChanged(sprintId: ID!): StandupChange!
    tarotRoomChanged(roomId: ID!): TarotRoomEvent!
  }
`;
