import { gql } from "@apollo/client";

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        email
        name
        isAdmin
        isSuperAdmin
        isGuest
      }
    }
  }
`;

export const GUEST_LOGIN = gql`
  mutation GuestLogin($name: String!) {
    guestLogin(name: $name) {
      token
      user {
        id
        email
        name
        isAdmin
        isSuperAdmin
        isGuest
      }
    }
  }
`;

export const MEMBER_SUGGESTIONS = gql`
  query MemberSuggestions {
    memberSuggestions {
      name
      fullName
    }
  }
`;

export const HEALTH = gql`
  query Health {
    health {
      ok
      database
      jira
      time
    }
  }
`;

export const ME = gql`
  query Me {
    me {
      id
      email
      name
      isAdmin
      isSuperAdmin
      isGuest
    }
  }
`;

export const VELOCITY = gql`
  query Velocity($squadId: ID!, $limit: Int) {
    velocity(squadId: $squadId, limit: $limit) {
      sprintId
      number
      name
      startDate
      endDate
      committedPoints
      completedPoints
      ticketCount
      doneCount
    }
  }
`;

export const JIRA_VELOCITY = gql`
  query JiraVelocity($squadId: ID!, $limit: Int) {
    jiraVelocity(squadId: $squadId, limit: $limit) {
      sprintId
      number
      name
      startDate
      endDate
      committedPoints
      completedPoints
      ticketCount
      doneCount
    }
  }
`;

export const BURNDOWN = gql`
  query Burndown($sprintId: ID!) {
    burndown(sprintId: $sprintId) {
      date
      remainingPoints
      idealPoints
    }
  }
`;

export const MEMBER_MOODS = gql`
  query MemberMoods($sprintId: ID!, $date: Date!) {
    memberMoods(sprintId: $sprintId, date: $date) {
      id
      memberId
      memberName
      date
      mood
    }
  }
`;

export const SPRINT_MOOD_HISTORY = gql`
  query SprintMoodHistory($squadId: ID!, $limit: Int) {
    sprintMoodHistory(squadId: $squadId, limit: $limit) {
      sprintId
      number
      name
      startDate
      endDate
      teamAverage
      members {
        memberId
        memberName
        position
        average
        points {
          date
          mood
        }
      }
    }
  }
`;

export const SET_MOOD = gql`
  mutation SetMood($sprintId: ID!, $memberId: ID!, $date: Date!, $mood: Int!, $leadKey: String) {
    setMood(sprintId: $sprintId, memberId: $memberId, date: $date, mood: $mood, leadKey: $leadKey) {
      id
      memberId
      date
      mood
    }
  }
`;

export const SEED_CONFIG = gql`
  mutation SeedConfig($json: String!) {
    seedConfig(json: $json) {
      squads
      membersCreated
      membersUpdated
    }
  }
`;

export const ADMINS = gql`
  query Admins {
    admins {
      id
      email
      name
      isSuperAdmin
      createdAt
    }
  }
`;

export const CREATE_ADMIN = gql`
  mutation CreateAdmin($email: String!, $name: String!, $password: String!) {
    createAdmin(email: $email, name: $name, password: $password) {
      id
    }
  }
`;

export const UPDATE_ADMIN = gql`
  mutation UpdateAdmin($id: ID!, $email: String, $name: String) {
    updateAdmin(id: $id, email: $email, name: $name) {
      id
    }
  }
`;

export const CHANGE_ADMIN_PASSWORD = gql`
  mutation ChangeAdminPassword($id: ID!, $password: String!) {
    changeAdminPassword(id: $id, password: $password)
  }
`;

export const DELETE_ADMIN = gql`
  mutation DeleteAdmin($id: ID!) {
    deleteAdmin(id: $id)
  }
`;

export const SQUADS = gql`
  query Squads {
    squads {
      id
      name
      defaultBoardId
      spFieldDefault
      spFieldFE
      spFieldBE
      spFieldQA
      confluenceSpaceKey
      confluenceParentId
      tarotScaleType
      tarotScaleValues
      jiraConfigured
    }
  }
`;

export const SQUAD = gql`
  query Squad($id: ID!) {
    squad(id: $id) {
      id
      name
      defaultBoardId
      jiraConfigured
      members {
        id
        name
        fullName
        position
        jiraAccountId
        leaves {
          id
          type
          startDate
          endDate
          note
          substitute {
            id
            name
          }
        }
      }
      holidays {
        id
        date
        name
      }
      sprints {
        id
        number
        name
        startDate
        endDate
      }
    }
  }
`;

export const JIRA_ENV = gql`
  query JiraEnv {
    jiraEnv {
      configured
      baseUrl
      email
      defaultBoardId
    }
  }
`;

export const CREATE_SQUAD = gql`
  mutation CreateSquad($name: String!) {
    createSquad(name: $name) {
      id
      name
    }
  }
`;

export const UPDATE_SQUAD = gql`
  mutation UpdateSquad(
    $id: ID!
    $name: String
    $defaultBoardId: String
    $spFieldDefault: String
    $spFieldFE: String
    $spFieldBE: String
    $spFieldQA: String
    $confluenceSpaceKey: String
    $confluenceParentId: String
    $tarotScaleType: String
    $tarotScaleValues: String
  ) {
    updateSquad(
      id: $id
      name: $name
      defaultBoardId: $defaultBoardId
      spFieldDefault: $spFieldDefault
      spFieldFE: $spFieldFE
      spFieldBE: $spFieldBE
      spFieldQA: $spFieldQA
      confluenceSpaceKey: $confluenceSpaceKey
      confluenceParentId: $confluenceParentId
      tarotScaleType: $tarotScaleType
      tarotScaleValues: $tarotScaleValues
    ) {
      id
      name
      defaultBoardId
      spFieldDefault
      spFieldFE
      spFieldBE
      spFieldQA
      confluenceSpaceKey
      confluenceParentId
      tarotScaleType
      tarotScaleValues
    }
  }
`;

export const JIRA_FIELDS = gql`
  query JiraFields($squadId: ID!) {
    jiraFields(squadId: $squadId) {
      id
      name
    }
  }
`;

export const JIRA_USERS = gql`
  query JiraUsers($squadId: ID!) {
    jiraUsers(squadId: $squadId) {
      accountId
      displayName
      email
    }
  }
`;

export const DELETE_SQUAD = gql`
  mutation DeleteSquad($id: ID!) {
    deleteSquad(id: $id)
  }
`;

export const ACTIVE_SPRINT_TICKETS = gql`
  query ActiveSprintTickets($squadId: ID!, $refresh: Boolean) {
    activeSprintTickets(squadId: $squadId, refresh: $refresh) {
      key
      status
      assignee
      summary
      url
      priority
      issueType
      epicKey
      epicName
      parentKey
      parentName
      parentType
      storyPoints
      storyPointsFE
      storyPointsBE
      storyPointsQA
      carryOver
      carryOverCount
      carryOverSprints
    }
  }
`;

export const GROOMING_BUCKETS = gql`
  query GroomingBuckets($squadId: ID!, $refresh: Boolean) {
    groomingBuckets(squadId: $squadId, refresh: $refresh) {
      key
      label
      kind
      tickets {
        key
        status
        summary
        url
        priority
        issueType
        epicKey
        epicName
        parentKey
        parentName
        parentType
      }
    }
  }
`;

export const NEXT_SPRINT_TICKETS = gql`
  query NextSprintTickets($squadId: ID!, $refresh: Boolean) {
    nextSprintTickets(squadId: $squadId, refresh: $refresh) {
      key
      status
      summary
      url
      priority
      issueType
      epicKey
      epicName
      parentKey
      parentName
      parentType
    }
    jiraNextSprint(squadId: $squadId) {
      id
      number
      name
      startDate
      endDate
    }
  }
`;

export const CURRENT_SPRINT = gql`
  query CurrentSprint($squadId: ID!) {
    currentSprint(squadId: $squadId) {
      id
      number
      name
      startDate
      endDate
    }
    sprints(squadId: $squadId) {
      id
      number
      name
      startDate
      endDate
      confluenceUrl
      confluenceExportedAt
    }
  }
`;

export const JIRA_ACTIVE_SPRINT = gql`
  query JiraActiveSprint($squadId: ID!) {
    jiraActiveSprint(squadId: $squadId) {
      id
      number
      name
      startDate
      endDate
    }
  }
`;

export const SYNC_ACTIVE_SPRINT = gql`
  mutation SyncActiveSprint($squadId: ID!) {
    syncActiveSprint(squadId: $squadId) {
      id
      number
      name
      startDate
      endDate
    }
  }
`;

export const DASHBOARD = gql`
  query Dashboard($sprintId: ID!, $date: Date) {
    dashboard(sprintId: $sprintId, date: $date) {
      date
      ticket {
        key
        status
        assignee
        summary
        url
        priority
        issueType
        epicKey
        epicName
        parentKey
        parentName
        parentType
        storyPoints
        storyPointsFE
        storyPointsBE
        storyPointsQA
        carryOver
        carryOverCount
        carryOverSprints
      }
      entry {
        id
        ticketKey
        ticketStatus
        ticketSummary
        ticketAssignee
        feAssignee
        beAssignee
        qaAssignee
        feProgress
        beProgress
        qaProgress
        updateText
        progress
        blockerNote
        hold
      }
    }
  }
`;

export const STANDUP_ENTRIES = gql`
  query StandupEntries($sprintId: ID!) {
    standupEntries(sprintId: $sprintId) {
      id
      date
      ticketKey
      ticketStatus
      ticketSummary
      ticketAssignee
      issueType
      storyPoints
      epicKey
      epicName
      parentKey
      parentName
      carryOverCount
      carryOverFrom
      feAssignee
      beAssignee
      qaAssignee
      updateText
      progress
      blockerNote
      hold
    }
  }
`;

export const ACTIVE_STANDUP = gql`
  query ActiveStandup($sprintId: ID!, $leadKey: String) {
    activeStandup(sprintId: $sprintId, leadKey: $leadKey) {
      sprintId
      leadName
      active
      isMine
      startedAt
    }
  }
`;

export const EXPORT_CONFLUENCE = gql`
  mutation ExportConfluence($sprintId: ID!) {
    exportSprintToConfluence(sprintId: $sprintId) {
      url
      title
    }
  }
`;

export const EXPORT_HISTORY = gql`
  query ExportHistory($sprintId: ID!) {
    exportHistory(sprintId: $sprintId) {
      id
      url
      action
      actor
      createdAt
    }
  }
`;

export const STANDUP_LOGS = gql`
  query StandupLogs($squadId: ID!, $limit: Int, $offset: Int) {
    standupLogs(squadId: $squadId, limit: $limit, offset: $offset) {
      id
      leadName
      startedAt
      endedAt
      durationSec
    }
  }
`;

export const STANDUP_CHANGED = gql`
  subscription StandupChanged($sprintId: ID!) {
    standupChanged(sprintId: $sprintId) {
      sprintId
      kind
    }
  }
`;

export const START_STANDUP = gql`
  mutation StartStandup($sprintId: ID!, $leadName: String!, $leadKey: String!, $date: Date) {
    startStandup(sprintId: $sprintId, leadName: $leadName, leadKey: $leadKey, date: $date) {
      sprintId
      leadName
      active
      isMine
      startedAt
    }
  }
`;

export const STANDUP_HEARTBEAT = gql`
  mutation StandupHeartbeat($sprintId: ID!, $leadKey: String!) {
    standupHeartbeat(sprintId: $sprintId, leadKey: $leadKey)
  }
`;

export const END_STANDUP = gql`
  mutation EndStandup($sprintId: ID!, $leadKey: String!) {
    endStandup(sprintId: $sprintId, leadKey: $leadKey)
  }
`;

export const SAVE_ENTRY = gql`
  mutation SaveEntry($input: StandupEntryInput!, $leadKey: String) {
    saveStandupEntry(input: $input, leadKey: $leadKey) {
      id
      ticketKey
      feAssignee
      beAssignee
      qaAssignee
      updateText
      progress
      blockerNote
      hold
    }
  }
`;

export const BLOCKERS = gql`
  query Blockers($squadId: ID!, $includeResolved: Boolean) {
    blockers(squadId: $squadId, includeResolved: $includeResolved) {
      id
      sprintId
      description
      jiraTicket
      foundDate
      resolvedDate
      note
      resolveNote
    }
  }
`;

export const ACTIVITY_LOG = gql`
  query ActivityLog($squadId: ID!, $limit: Int, $offset: Int, $search: String) {
    activityLog(squadId: $squadId, limit: $limit, offset: $offset, search: $search) {
      id
      actor
      ticketKey
      message
      prevText
      newText
      createdAt
    }
  }
`;

export const UPSERT_BLOCKER = gql`
  mutation UpsertBlocker($squadId: ID!, $id: ID, $input: BlockerInput!) {
    upsertBlocker(squadId: $squadId, id: $id, input: $input) {
      id
    }
  }
`;

export const DELETE_BLOCKER = gql`
  mutation DeleteBlocker($id: ID!) {
    deleteBlocker(id: $id)
  }
`;

export const TEST_JIRA = gql`
  mutation TestJira {
    testJiraConfig
  }
`;

export const RESET_DATABASE = gql`
  mutation ResetDatabase($reseedDefaults: Boolean) {
    resetDatabase(reseedDefaults: $reseedDefaults)
  }
`;

export const ADD_MEMBER = gql`
  mutation AddMember($squadId: ID!, $input: TeamMemberInput!) {
    addMember(squadId: $squadId, input: $input) {
      id
    }
  }
`;

export const UPDATE_MEMBER = gql`
  mutation UpdateMember($id: ID!, $input: TeamMemberInput!) {
    updateMember(id: $id, input: $input) {
      id
      name
      fullName
      position
      jiraAccountId
    }
  }
`;

export const DELETE_MEMBER = gql`
  mutation DeleteMember($id: ID!) {
    deleteMember(id: $id)
  }
`;

export const ADD_LEAVE = gql`
  mutation AddLeave($input: LeaveInput!) {
    addLeave(input: $input) {
      id
    }
  }
`;

export const DELETE_LEAVE = gql`
  mutation DeleteLeave($id: ID!) {
    deleteLeave(id: $id)
  }
`;

export const ADD_HOLIDAY = gql`
  mutation AddHoliday($squadId: ID!, $input: HolidayInput!) {
    addHoliday(squadId: $squadId, input: $input) {
      id
    }
  }
`;

export const DELETE_HOLIDAY = gql`
  mutation DeleteHoliday($id: ID!) {
    deleteHoliday(id: $id)
  }
`;

export const CREATE_SPRINT = gql`
  mutation CreateSprint($squadId: ID!, $input: SprintInput!) {
    createSprint(squadId: $squadId, input: $input) {
      id
    }
  }
`;

export const UPDATE_SPRINT = gql`
  mutation UpdateSprint($id: ID!, $input: SprintInput!) {
    updateSprint(id: $id, input: $input) {
      id
    }
  }
`;

export const DELETE_SPRINT = gql`
  mutation DeleteSprint($id: ID!) {
    deleteSprint(id: $id)
  }
`;

// ---------------------------------------------------------------------------
// Tarot (planning poker)
// ---------------------------------------------------------------------------
export const TAROT_ROOM_FIELDS = gql`
  fragment TarotRoomFields on TarotRoom {
    id
    squadId
    name
    hostName
    status
    scaleType
    scaleValues
    sprintName
    createdAt
    endedAt
    isHost
    viewerKicked
    viewerVote {
      value
      confirmed
    }
    participants {
      id
      name
      isHost
      online
      hasVoted
      joinedAt
    }
    currentRound {
      id
      ticketKey
      ticketSummary
      ticketType
      ticketPriority
      ticketUrl
      status
      cycle
      createdAt
      voteCount
      revealed
      syncPercent
      suggestion
      votes {
        participantId
        name
        value
      }
    }
    results {
      ticketKey
      ticketSummary
      parentKey
      parentName
      effort
      pointFE
      pointBE
      pointQA
      decidedAt
      syncedAt
    }
  }
`;

export const TAROT_ROOMS = gql`
  query TarotRooms($squadId: ID!) {
    tarotRooms(squadId: $squadId) {
      id
      name
      hostName
      status
      createdAt
      endedAt
      participantCount
    }
  }
`;

export const TAROT_ROOM = gql`
  query TarotRoom($id: ID!, $key: String) {
    tarotRoom(id: $id, key: $key) {
      ...TarotRoomFields
    }
  }
  ${TAROT_ROOM_FIELDS}
`;

export const TAROT_TICKETS = gql`
  query TarotTickets($roomId: ID!, $refresh: Boolean) {
    tarotTickets(roomId: $roomId, refresh: $refresh) {
      key
      summary
      issueType
      priority
      status
      url
      parentKey
      parentName
      result {
        ticketKey
        effort
        pointFE
        pointBE
        pointQA
        syncedAt
      }
    }
  }
`;

export const CREATE_TAROT_ROOM = gql`
  mutation CreateTarotRoom($squadId: ID!, $hostName: String!, $hostKey: String!) {
    createTarotRoom(squadId: $squadId, hostName: $hostName, hostKey: $hostKey) {
      ...TarotRoomFields
    }
  }
  ${TAROT_ROOM_FIELDS}
`;

export const JOIN_TAROT_ROOM = gql`
  mutation JoinTarotRoom($roomId: ID!, $name: String!, $key: String!) {
    joinTarotRoom(roomId: $roomId, name: $name, key: $key) {
      ...TarotRoomFields
    }
  }
  ${TAROT_ROOM_FIELDS}
`;

export const LEAVE_TAROT_ROOM = gql`
  mutation LeaveTarotRoom($roomId: ID!, $key: String!) {
    leaveTarotRoom(roomId: $roomId, key: $key)
  }
`;

export const TAROT_HEARTBEAT = gql`
  mutation TarotHeartbeat($roomId: ID!, $key: String!) {
    tarotHeartbeat(roomId: $roomId, key: $key)
  }
`;

export const KICK_TAROT_PARTICIPANT = gql`
  mutation KickTarotParticipant($roomId: ID!, $key: String!, $participantId: ID!) {
    kickTarotParticipant(roomId: $roomId, key: $key, participantId: $participantId)
  }
`;

export const SET_TAROT_SCALE = gql`
  mutation SetTarotScale($roomId: ID!, $key: String!, $scaleType: String!, $scaleValues: [Float!], $setDefault: Boolean) {
    setTarotScale(roomId: $roomId, key: $key, scaleType: $scaleType, scaleValues: $scaleValues, setDefault: $setDefault) {
      ...TarotRoomFields
    }
  }
  ${TAROT_ROOM_FIELDS}
`;

export const START_TAROT_ROUND = gql`
  mutation StartTarotRound($roomId: ID!, $key: String!, $ticketKey: String!) {
    startTarotRound(roomId: $roomId, key: $key, ticketKey: $ticketKey) {
      id
      ticketKey
      status
    }
  }
`;

export const CAST_TAROT_VOTE = gql`
  mutation CastTarotVote($roomId: ID!, $key: String!, $value: String!, $confirmed: Boolean!) {
    castTarotVote(roomId: $roomId, key: $key, value: $value, confirmed: $confirmed)
  }
`;

export const NEXT_TAROT_CYCLE = gql`
  mutation NextTarotCycle($roomId: ID!, $key: String!) {
    nextTarotCycle(roomId: $roomId, key: $key) {
      id
      ticketKey
      status
    }
  }
`;

export const FORCE_REVEAL_TAROT_ROUND = gql`
  mutation ForceRevealTarotRound($roomId: ID!, $key: String!) {
    forceRevealTarotRound(roomId: $roomId, key: $key) {
      id
      status
    }
  }
`;

export const DECIDE_TAROT_POINT = gql`
  mutation DecideTarotPoint($roomId: ID!, $key: String!, $effort: Float!, $pointFE: Float, $pointBE: Float, $pointQA: Float) {
    decideTarotPoint(roomId: $roomId, key: $key, effort: $effort, pointFE: $pointFE, pointBE: $pointBE, pointQA: $pointQA) {
      ticketKey
      effort
    }
  }
`;

export const RESET_TAROT_POINTS = gql`
  mutation ResetTarotPoints($roomId: ID!, $key: String!) {
    resetTarotPoints(roomId: $roomId, key: $key)
  }
`;

export const END_TAROT_ROOM = gql`
  mutation EndTarotRoom($roomId: ID!, $key: String!) {
    endTarotRoom(roomId: $roomId, key: $key)
  }
`;

export const DELETE_TAROT_ROOM = gql`
  mutation DeleteTarotRoom($roomId: ID!, $key: String!) {
    deleteTarotRoom(roomId: $roomId, key: $key)
  }
`;

export const SYNC_TAROT_TO_JIRA = gql`
  mutation SyncTarotToJira($roomId: ID!, $key: String!, $fields: [String!]!) {
    syncTarotToJira(roomId: $roomId, key: $key, fields: $fields) {
      updated
      tickets
      failed
    }
  }
`;

export const RESET_TAROT_SYNC = gql`
  mutation ResetTarotSync($roomId: ID!, $key: String!) {
    resetTarotSync(roomId: $roomId, key: $key)
  }
`;

export const TAROT_ROOM_CHANGED = gql`
  subscription TarotRoomChanged($roomId: ID!) {
    tarotRoomChanged(roomId: $roomId) {
      roomId
      kind
      actor
    }
  }
`;

// ─────────────────────────── Fortune (Gemini ticket creator) ───────────────
export const FORTUNE_MODELS = gql`
  query FortuneModels {
    fortuneModels
  }
`;

export const FORTUNE_SEARCH_TICKETS = gql`
  query FortuneSearchTickets($squadId: ID!, $query: String!) {
    fortuneSearchTickets(squadId: $squadId, query: $query) {
      key
      summary
      issueType
    }
  }
`;

export const FORTUNE_DRAFTS = gql`
  query FortuneDrafts($squadId: ID!) {
    fortuneDrafts(squadId: $squadId) {
      id
      mode
      summary
      createdById
      createdByName
      createdAt
      updatedAt
      payload
      requirementText
      turns
      usage
      canDelete
    }
  }
`;

export const FORTUNE_HISTORY = gql`
  query FortuneHistory($squadId: ID!, $limit: Int) {
    fortuneHistory(squadId: $squadId, limit: $limit) {
      id
      action
      mode
      summary
      byId
      byName
      createdAt
      jiraKey
      payload
      turns
      usage
    }
  }
`;

const FORTUNE_RESULT_FIELDS = `
  mode
  payload
  turns
  ticketKey
  prev
  usage {
    promptTokens
    outputTokens
    totalTokens
    model
    estCostUSD
    estCostIDR
  }
`;

export const FORTUNE_GENERATE = gql`
  mutation FortuneGenerate($squadId: ID!, $mode: String!, $lang: String, $issuetype: String, $model: String, $text: String, $files: [FortuneFileInput!]) {
    fortuneGenerate(squadId: $squadId, mode: $mode, lang: $lang, issuetype: $issuetype, model: $model, text: $text, files: $files) {
      ${FORTUNE_RESULT_FIELDS}
    }
  }
`;

export const FORTUNE_REFINE = gql`
  mutation FortuneRefine($squadId: ID!, $mode: String!, $model: String, $instruction: String!, $payload: String!, $turns: String!) {
    fortuneRefine(squadId: $squadId, mode: $mode, model: $model, instruction: $instruction, payload: $payload, turns: $turns) {
      ${FORTUNE_RESULT_FIELDS}
    }
  }
`;

export const FORTUNE_IMPORT = gql`
  mutation FortuneImport($squadId: ID!, $ticketKey: String!) {
    fortuneImport(squadId: $squadId, ticketKey: $ticketKey) {
      ${FORTUNE_RESULT_FIELDS}
    }
  }
`;

export const FORTUNE_CREATE = gql`
  mutation FortuneCreate($squadId: ID!, $mode: String!, $payload: String!, $reporterEmail: String) {
    fortuneCreate(squadId: $squadId, mode: $mode, payload: $payload, reporterEmail: $reporterEmail) {
      mode
      created
      epic
      children
      reporterWarning
    }
  }
`;

export const FORTUNE_UPDATE = gql`
  mutation FortuneUpdate($squadId: ID!, $ticketKey: String!, $payload: String!) {
    fortuneUpdate(squadId: $squadId, ticketKey: $ticketKey, payload: $payload)
  }
`;

export const FORTUNE_UNDO = gql`
  mutation FortuneUndo($squadId: ID!, $ticketKey: String!, $prev: String!) {
    fortuneUndo(squadId: $squadId, ticketKey: $ticketKey, prev: $prev)
  }
`;

export const SAVE_FORTUNE_DRAFT = gql`
  mutation SaveFortuneDraft($squadId: ID!, $id: ID, $mode: String!, $summary: String!, $payload: String!, $requirementText: String, $turns: String, $usage: String) {
    saveFortuneDraft(squadId: $squadId, id: $id, mode: $mode, summary: $summary, payload: $payload, requirementText: $requirementText, turns: $turns, usage: $usage) {
      id
    }
  }
`;

export const DELETE_FORTUNE_DRAFT = gql`
  mutation DeleteFortuneDraft($id: ID!) {
    deleteFortuneDraft(id: $id)
  }
`;

export const GEMINI_SETTINGS = gql`
  query GeminiSettings {
    geminiSettings {
      temperature
      defaultTemperature
      model
      configured
    }
  }
`;

export const SET_GEMINI_TEMPERATURE = gql`
  mutation SetGeminiTemperature($value: Float!) {
    setGeminiTemperature(value: $value)
  }
`;
