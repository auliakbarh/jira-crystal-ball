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
        isGuest
      }
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
      isGuest
    }
  }
`;

export const SQUADS = gql`
  query Squads {
    squads {
      id
      name
      defaultBoardId
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
  mutation UpdateSquad($id: ID!, $name: String, $defaultBoardId: String) {
    updateSquad(id: $id, name: $name, defaultBoardId: $defaultBoardId) {
      id
      name
      defaultBoardId
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
      carryOver
      carryOverCount
      carryOverSprints
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

export const START_STANDUP = gql`
  mutation StartStandup($sprintId: ID!, $leadName: String!, $leadKey: String!) {
    startStandup(sprintId: $sprintId, leadName: $leadName, leadKey: $leadKey) {
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
