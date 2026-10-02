# 3813ICT Full Stack Development

## Phase 2 - Fully Functioning Application

**Name:** Sovannsocheata Rith  
**Student Number:** s5395943  
**Workshop Time:** 1 pm to 3 pm on Wednesday

**GitHub Repository:** https://github.com/CherryRith-2026/Phase-1-Assignment-Full-Stack

## 1. Application Overview

Fabulari is a full-stack group chat application where users can gather to communicate and interact with another active users. They can create an account, editing their profile, browsing for available groups, send a request to join the groups or make a request to create new group to the Super Admin. The application contains three main roles which are **User, Group Admin and Super Admin** with different permissions. 

The final application updated with the use of **MEAN stack** and the **Angular** is being utilised for accessing the client. Whereas **Node.js and Express** used for running the backend server, and the data of the application is being collected by **MongoDB**. With real-time chat and showing the active users inside the chat room, joining and leaving notification alert other users who's joining and leaving with the use of **Socket.IO**.

The prototype of phase 2 will be an extends from phase 1 and an improved version that working with client and server application. The completed features such as authentication, profile, Date of Birth (DOB), age restrictions, group requests, group approval from Super Admin, Group Admin management, chat rooms, real-time messages and image file upload, audit logs for Super Admin, and automated testings. 

## 2. Updated Specifications and Requirements

The requirements from phase 1 remain the same with IDs from **FR01 to FR41**. Phase 2 status will show how those original requirements are matching and relates to the final code. It is very helpful because some ideas from phase 1 have changed or did not fully complete or met during the phase 2.

### 2.1 Functional Requirements

| ID | Role | Original Functional Requirement | Phase 2 Status | Implementation |
|---|---|---|---|---|
| FR01 | User | A user can login to the application with their username and password input. | Implemented | Users can log in with their input username and password. |
| FR02 | User | A user can request the creation of a new group, and they should provide the required details in the request (age limit, colour theme, submit title, description). | Implemented | Users can make a request to the Super Admin to create a new group. |
| FR03 | User | User can request to join a group through sending a message request to the group admin, and they can view the available groups. | Implemented | Users can browse for the available groups and click to send a join request. |
| FR04 | User | Users can enter many groups as they want or be a member of multiple groups. | Implemented | A user has the access to join more than one group and belong to more than one group. |
| FR05 | User | Users can enter the chat rooms if they are a member of that group, by the approval age access. If they can't enter the room, it means the users are not qualify for the age limit to be able to enter the chat room. | Implemented | To prevent users from accessing any group without permission or request, we keep it safe by allowing users to join if their age is matched with the requirements, the server will check group member and age of the users. |
| FR06 | User | Users can only send and receive text messages in real-time in the chat. | Implemented | Users can send and receive real-time text messages using Socket.IO being applied in the code. |
| FR07 | User | The chat also provides messages input and supports the PNG image file upload and GIF in the message. | Implemented | Users can send PNG and GIF images in the chat. |
| FR08 | User | Users can see the five previous messages on the chat screen after entering the chat room. | Implemented | The latest of five responses will be stored and show when the user enters the chat room to see the latest communication. |
| FR09 | User | There will be a notification that will load when another user joins in or leaves the room, and it will notify all users in the chat room. | Implemented | The user will get notification when another user join or leave in the chat. |
| FR10 | User | Users can see who else is in the chat room. | Implemented | The chat successfully shows who are active inside the chat room with other active users. |
| FR11 | Group Admin | A Group Admin will handle and manage the details of the group such as, name, description, colour theme, and the minimum age limit. | Implemented | The group name, description, colour theme, and minimum age requires can be edit by the Group Admin. |
| FR12 | Group Admin | Group Admin can create chat rooms within a group. | Implemented | Chat rooms can be created by the Group Admin.|
| FR13 | Group Admin | Group Admin can make changes or editing their chat room's details that have been created by them. | Implemented | Renaming the chat room is also a Group Admin duty to make changes. |
| FR14 | Group Admin | Group Admin also can delete or remove the chat rooms of their group. | Implemented | Chat room deletion can be done by the Group Admin.|
| FR15 | Group Admin | A Group Admin can view the approved request members or members that are allowed to be in the group and a banned user of the group. | Partly implemented | The members who send a request or the one that are already approved can be viewed by Group Admin, but the banned users from a group was not finished. |
| FR16 | Group Admin | A Group Admin can add and remove members from their group. | Partly implemented | The app already implemented the self-leaving the group for users and making join approval by Group Admin is implemented. The direct remove or adding member management was not completed. |
| FR17 | Group Admin | A Group Admin can ban a regular user from their group. | Not completed | The phase 2 code doesn't contain the group ban or user ban.  |
| FR18 | Group Admin | A Group Admin can also approve or reject the user's requests who wants to join their group too. | Implemented | The requests from the users can be approve or reject and pending join requests by the Group Admin.|
| FR19 | Group Admin | A Group Admin can also promote a user in that group to become another admin because in a group, they can have multiple group admins. As well as, if the initial group admin wanted to leave their role as an admin, they will promote another user from that group to be the admin instead. | Implemented | The Group Admin can make another member or promote them to be another Group Admin, and the admin can demote the members while also protecting the last admin. |
| FR20 | Group Admin | A Group Admin can send a request message to remove the user from the entire system with provided reason for the super admin, for the super admin to remove them entirely from the system. | Not completed | The request from Group Admin to remove or ban user from the whole system was not implemented. |
| FR21 | Group Admin | A Group Admin can also ask permission and request the super admin to delete the group as well. | Not completed | The delete group endpoints in the Super Admin are there, but the planned to delete the request was not there to be completed. |
| FR22 | Super Admin | The super admin will receive and review the requests from the users that asked to create a new group. | Implemented | The new group creation requests can be seen and viewed by the Super Admin.|
| FR23 | Super Admin | After the approval of user's group request, the super admin can create a new group for the user. | Implemented | When Super Admin approve the group request, it will create the group. |
| FR24 | Super Admin | Super admin can assign the first user who requested to create the group to be the first initial group admin. | Implemented | The first person to request group creation will become the first Group Admin of that group. |
| FR25 | Super Admin | The super admin can also get the requests from the group admin to ban or remove the users from the entire system. | Not completed | The user removal request was not created and completed for Super Admin to view.  |
| FR26 | Super Admin | The super admin can remove user from the entire system. | Partly implemented | The user deletion endpoints do exist, but the protected Super Admin removal functionality was not completed. |
| FR27 | Super Admin | Super admin can also get a request message from the group admins to make a group deletion process. | Not completed | The plan of making the Group Admin sending the request to delete the group is not completed successfully. |
| FR28 | Super Admin | Super admin also has the access to view which accounts have been permanently banned from the system as well. | Not completed | The banned user list is not completed or created. |
| FR29 | Super Admin | The super admin can view by look through and search for all the audit logs that contains the history of every action inside the system, such as users being removed or created and added to groups. | Partly implemented | Audit logs were created and the Super Admin can view the logs, however, the search and full audit (except the important logs) is not completed. |
| FR30 | System | System itself will create the initial super admin by using a bootstrap process when there are no users exist in the system yet. | Implemented | Server has one and initial Super Admin bootstrap process. |
| FR31 | System | Once the super admin is being created, the bootstrap process in the system will not run again. | Implemented | The bootstrap only created one exist Super Admin and it avoids the system to create another one after it already exists. |
| FR32 | System | Based on the age limit, which is the minimum age set for the group, will make the system restrict the group membership and users who do not meet the minimum age requirement will not allow to join the group. | Implemented | The age is calculated using the DOB and it allow the system to approve or reject according to the age appear, this help to check against the group's minimum age. |
| FR33 | System | In other case, if the group admin increases the group's minimum age, the members that are in that group who are below that new minimum age will be removed immediately from the group. | Partly implemented | The age and access are being checked, and the underage members are not removed from the membership after the limit being changed. |
| FR34 | System | Inside the group, it can have more than one chat rooms. Which mean it can have unlimited number of chat rooms, and it can also be none as well. | Implemented | Every group can have empty chat room or have more than one chat rooms. |
| FR35 | System | The colour theme will apply to the group and the chat rooms as well once it is selected. | Implemented | The colour theme is used as a group colour theme or identifying a specific group. |
| FR36 | System | The system can only support the image and text interaction in the chat, but it won't support the video or voice interaction. | Implemented | The chat input also supports the text messages and the images with PNG or GIF. |
| FR37 | System | System will display the five previous messages that left in the chat room for users who enters the chat room to see what the conversation was previously were about. | Implemented | There is five latest messages that appear when entering the room. |
| FR38 | System | The system will make the users to view who currently active in the chat room by the notification message of which users enter and left. | Implemented | The Socket.IO is there to show the real-time active users. |
| FR39 | System | System will give users a notification in the chat room when user joins or leaves the room with their name. | Implemented | The Socket.io help to notify the user to see who joins or leaves with user's username. |
| FR40 | System | System will record all important history of the administrative actions in the audit logs. | Partly implemented | The audit logs are implemented that stores the admin actions, but not every system action occurred inside. |
| FR41 | System | The group admin cannot be left without the administrator, so in the group must have at least one group admin. | Implemented | The demotion button and leave button help users or Group Admin to make decision and help them to avoid losing the final Group Admin by demote another member to be Group Admin so the first admin can leave. |

### 2.2 Updated Specifications and Assumptions

| Area | Final Phase 2 Specification |
|---|---|
| User roles | The application contains User, Group Admin, and Super Admin roles. |
| Authentication | Authentication login helps user logging in, and the server creates the session for them to logged in and the password will safely use bycrypt for security of the user's privacy information and make it securely stored.  |
| Age | The age is being calculated from the DOB of the users rather than storing a fixed age data. |
| Group joining | User will send join request, and the Group Admin will decide to approve or reject the request. |
| Group creation | A user sends a group creation request. The Super Admin can approve or reject it. It will also appear in audit log. |
| Group Admin | The group can have more than one Group Admin if the Group Admin demote the member to be an admin, at least one Group Admin must be in the group so it cannot have non-Group Admin.|
| Chat rooms | Chat rooms are dynamic and are stored with each group. The chat rooms have a dynamic feature and store for each group. Each group can have their own chat rooms that the Group Admin can create, rename, and delete. |
| Chat | The real-time messages were created by using Socket.IO that help making text messages, images, user leave or join alert in the chat by using real-time functionality. |
| Message history | The history and data storage will be stores in MongoDB, such as chat messages and the latest five messages loaded when user enter the chat room.  |
| Group ban | The group ban feature was not implemented according to plan for the final application. |
| System user removal | The system for user removal feature is not completed between Group Admin and Super Admin.  |
| Audit logs | The important data and actions are being stored in the system logs, but it doesn't store fully with every action in the system. |

## 3. Full API Documentation

The Express server provides REST API routes for the authentication, profiles, groups, membership, Group Admin functions and Super Admin functions. The Angular client use those APIs to communicate with the server. 

### 3.1 REST API Endpoints

| Method | API Route | Purpose | Access |
|---|---|---|---|
| POST | `/api/login` | It creates a session for logged in user as it also helps user to log into the page | Public |
| POST | `/api/logout` | It help to navigate and log the current user out of the page. | Logged-in user |
| GET | `/api/users` | This will return the users and get the list of users without showing their password data. | Public in current code |
| POST | `/api/users` | Creates a new user account. | Public |
| GET | `/api/users/:id` | Returns one user without showing password data | Public in current code |
| PUT | `/api/users/:id` | it helps updates the logged-in user's profile after they edit their detail. | Logged-in owner |
| DELETE | `/api/users/:id` | The earlier API make user deletion endpoint. | Public in current code and it is not the completed Super Admin removal |
| GET | `/api/groups` | Returns groups. | Public in current code |
| POST | `/api/groups` | Earlier API created route for groups. | Logged-in user |
| GET | `/api/groups/:id` | Returns one group. | Public in current code |
| DELETE | `/api/groups/:id` | Deletes a group. | Super Admin |
| GET | `/api/my/groups` | Returns the groups that the current user belongs to. | Logged-in user |
| GET | `/api/groups/available` | Returns available groups and check if the user able to join with their age and join status.| Logged-in user |
| POST | `/api/groups/:groupId/join-requests` | Help users to sends a request to join a group. | Logged-in user |
| DELETE | `/api/groups/:groupId/join-requests` | Cancels the user's pending join request from requesting to join group. | Logged-in user |
| GET | `/api/groups/:groupId/join-requests` | Shows pending requests for every group that user try to click request to join group. | Group Admin |
| POST | `/api/groups/:groupId/join-requests/:requestId/approve` | Group Admin approves a join request. | Group Admin |
| POST | `/api/groups/:groupId/join-requests/:requestId/reject` | Rejects a join request. | Group Admin |
| GET | `/api/groups/:groupId/members` | Show the members of the group and roles. | Group member |
| DELETE | `/api/groups/:groupId/members/me` | Leaves a group. | Group member |
| POST | `/api/groups/:groupId/admins/:memberId` | Promotes a member to be a Group Admin by demotion. | Group Admin |
| DELETE | `/api/groups/:groupId/admins/:memberId` | Demotes a Group Admin to be a normal member. | Group Admin |
| PUT | `/api/groups/:id` | Updates group settings. | Group Admin |
| GET | `/api/groups/:groupId/rooms` | Show the group chat rooms. | Group member |
| POST | `/api/groups/:groupId/rooms` | Creates a chat room for the group. | Group Admin |
| PUT | `/api/groups/:groupId/rooms/:roomName` | Renames a specific chat room. | Group Admin |
| DELETE | `/api/groups/:groupId/rooms/:roomName` | Deletes a chat room. | Group Admin |
| GET | `/api/my/group-creation-requests` | Shows the user's group creation requests. | Logged-in user |
| POST | `/api/group-creation-requests` | Allow user to send a new group creation request. | Logged-in user |
| DELETE | `/api/group-creation-requests/:id` | Cancels their own pending group creation request. | Request owner |
| GET | `/api/admin/group-creation-requests` | Shows requests waiting for Super Admin review. | Super Admin |
| POST | `/api/admin/group-creation-requests/:id/approve` | Approves a group creation request. | Super Admin |
| POST | `/api/admin/group-creation-requests/:id/reject` | Rejects a group creation request. | Super Admin |
| GET | `/api/admin/audit-logs` | Returns audit logs. | Super Admin |

### 3.2 Socket.IO Events

Socket.IO is used to create a real-time communication chat between users. The server checks the user's session and accessing the group before allowing the chat to interact or make actions.

| Socket.IO Events | Direction | Purpose |
|---|---|---|
| `chat:join` | Client to Server | It checks the sessions, members, age and chat rooms, then when the user access to join the room, it will load the five messages from previous conversation. |
| `chat:leave` | Client to Server | Allow users to leave the current chat room.  |
| `chat:send` | Client to Server| Allow users to send the text message, PNG or GIF.|
| `chat:message` | Server to Client | Allow to send new chat or text message to the chat room users. |
| `chat:presence` | Server to Client | It will show active users and update the lists of active users in the chat room. |
| `chat:notice` | Server to Client | It will show and alert when the user joins or leaves the chat room. |
| `chat:room` | Server to Client | After changes are made in the chat room settings, it will update the chat room with new information. |
| `chat:revoked` | Server to Client | It shows and tells the client to be aware when they are no longer having access to the chat. |

## 4. Angular Components, Services and Models

The Angular client is separated into components for the main screen and services of API, session, and chat communication. 

### 4.1 Components

| Components | Purpose |
|---|---|
| `Login` | Login form input for users to enter their details and starts the user's session. |
| `Signup` | Create or registered new user account for first registration and login as user. |
| `Home` | Main home page and shows the user's current exist joined groups and browse the available groups. |
| `Profile` | Profile of user's details in one page that can be edit and update the profile, include user's name, DOB, and age.  |
| `BrowseGroups` | Shows available groups allowing users to make a request or cancellation for joining groups with age limit. |
| `GroupCreation` | Make new group creation requests and send a group creation request with status. |
| `GroupPage` | Page for the selected groups. |
| `GroupSettings` | Group Admin can edit their group details and adjust the minimum age required with the age filtering. |
| `GroupRooms` | Shows the chat rooms and lets Group Admin create, rename or delete them. |
| `RoomChat` | Main Socket.IO chat will used for messages, images, active, and notification/message alert. |
| `GroupMembers` | Shows members, join requests and promote or demote options. |
| `LeaveGroup` | Allow member to leave and promote another person to be a group admin. They can leave is there is one or more Group Admins.  |
| `SuperAdmin` | Checks the group creation requests, approve or rejects. |
| `AuditLogs` | Shows audit records to the Super Admin in their page. |
| `ChatRoom` | Previous Study chat component kept from Phase 1. |
| `MusicChat` | Previous Music chat component kept from Phase 1. |
| `ActionIcon` | Reusable icon component for action buttons. |

### 4.2 Services and Shared Logic

| Services and Shared File | Purpose |
|---|---|
| `GroupApi` | This API sends the Angular HTTP requests for the groups, group requests, members and admin actions. |
| `Session` | Session will keep and stores the logged-in user or session token and authentication status. |
| `ChatConnection` | Handling the Socket.IO connection used inside the chat room. |
| `age.ts` / `age.mjs` | Calculates the correct age from the date of birth. |
| `superAdminGuard` | Protects and secure the Super Admin Angular routes. |

### 4.3 Models and Interfaces

| Models and Interface | Main Data |
|---|---|
| `Group` | Group ID, name, description, minimum age, colour and admin status details. |
| `AvailableGroup` | Group data and details whether user can join  group or not. |
| `PendingJoinRequest` | Users and requests details, age, and the request status. |
| `GroupMember` | Member ID, username, Group Admin status, and roles. |
| `CreationInput` | Name, description, minimum age and colour theme for a requested for a new group. |
| `CreationRequest` | Group request details, the user who requested, status and optional group ID. |
| `AuditLog` | Action being record from the system on which user or person did the action,  performer, target and date or time of when it happened. |
| `ChatMessage` | Room/message IDs, username, date and time, text messages or image data. |

### 4.4 Angular Routes

| Angular Route | Page |
|---|---|
| `/login` | Login page |
| `/signup` | Sign-up page |
| `/home` | Home page |
| `/profile` | Profile page|
| `/browse-groups` | Browse Groups page |
| `/request-group` | Group Creation page |
| `/group-requests` | Group Creation / request history |
| `/groups/:id` | Groups Page |
| `/super-admin` | Super Admin page |
| `/audit-logs` | Audit Logs page |
| `/chat-room` | Study chat room page |
| `/music-chat` | Music chat room page |

### 4.5 MongoDB Data Used by the Application

 The MongoDB is used in this final application to store data from the system, and it is the main database in the app. While JSON files are kept in the repository which is the older data and not the main live database with real-time action being stored.

| MongoDB Collection | What It Stores |
|---|---|
| `users` | Accounts of users, user's profile information, DOB, role and bcrypt password hash. |
| `groups` | Group information, members inside the group, Group Admins, minimum age of usersm colour theme, and room references. |
| `sessions` | Contains the login sessions and the expiry or cancellation information. |
| `joinRequests` | User's requests who wants to join the groups. |
| `groupCreationRequests` | User's requests that wants to create new group. |
| `messages` | It stored and saved the chat messages in the chat history.  |
| `auditLogs` | Administrative actions are stored inside the audit log application system. |

## 5. Design Documents

Phase 1 design files are kept inside the doc/images/ and it shows the original layout with responsive design ideas that used to guide for making the final application. 

| Design File | Purpose of the design |
|---|---|
| `Login.png` | Design to create a login in page with forms input. |
| `Sign-up.png` | Design to create a sign-up page for user to register their details in the input form. |
| `Home.png` | Design a home page with groups available and current joined groups. |
| `Profile.png` | Design for user's profile and store personal details. |
| `Chat-room.png` | Design the chat room for users inside the group to interact and for admin to edit. |
| `Responsive.png` | Design for a responsive layout of the screen with working functionality. |
| `Storyboard.png` | This design to show the plan and low-fidelity prototype of each wireframe and steps that user can experience, such as navigation from screens to screens. |

### 5.1 Phase 2 Design Updates

The final implementation in this phase 2 application will maintain the simple design from phase 1 but adding more features and new working/interactive main functions that is required in the final application. It includes, Browse Groups, Group Creation requests, Group Admin Settings, member management, chat rooms, Super Admin approval for the requests and audit logs in the dashboard. 

The function/interface includes in successful alert messages, loading messages, error messages that alert users to aware of their actions in the system. The application will use Angular components so that each function has their own separated screens and pages or reusable parts to keep everything organised.

### 5.2 Responsive Design

In Phase 1 responsive design, it is still used for this phase 2 implementation as a guide. The final Angular uses the CSS to adjust different screen sizes while maintaining the main navigation and actions responsive and user-friendly or understandable for the interface.

## 6. Testing Tools and Methodology

The testing tools were utilised when checking both server and Angular client to see if it both works correctly. The tests run a normal successful results and actions by checking the main functions, including the invalid input, permission errors and checking other possible errors

The server tests use Node's test runner. The chat tests also use Socket.IO clients to test real-time communication. Angular tests check components, services, API requests, session behaviour and UI states.

The server tests that used the Node's test runner to check and test the backend functions, whereas Socket.IO is used for the chat tests to test the real-time messages in clients. The angular tests also check every component, services, API requests, user sessions, and how the interface interact or response.

### 6.1 Automated Tests Performed

| Test Function | What Was Tested |
|---|---|
| Authentication | Login page, using incorrect password, using bcrypt password, signup and having user sessions to identify the user. |
| Profile | Updating the profile and loading the profile page, DOB and age, validation and role. |
| Groups | Available groups in the Browse Group, My Groups, checking the membership and the minimum age. |
| Join Requests | Create requests, cancelling the requests, approving request, rejecting the join requests such as duplicate requests. |
| Group Creation | Submitting for new group requests, cancel the requests, approve and reject the group creation requests and validation. |
| Group Members/Admin | Lists of group members, promote and demote Group Admins, and keeping at least one Group Admin inside the group. |
| Group Settings/Rooms | Updating or editing the group information and creating, renaming, and deleting the chat rooms. |
| Leave Group | Allow to leave group unless there is one admin in the group. |
| Chat | Access to chat rooms, text messages and images, five previous last text messages in the chat, active users, and join or leaving the chat notices. |
| Super Admin | Having the protected access with Super Admin, reviewing the group requests and viewing the audit logs. |
| Angular UI | Components, API calls/requests, loading/error messages, routes page access permissions and session use for users. |
| Age Logic | Age calculation from the DOB, handling the invalid or incorrect dates, check the age based on before or on or after birthdays, and handling future DOB. |

### 6.2 Final Test Results

| Test Suite | Result |
|---|---|
| Server tests | **72 passed** |
| Angular test files | **19 passed** |
| Angular tests | **101 passed** |
| Angular production build | **Passed** |

The final test results show that the implementation of server and Angular functions passed the automated tests that is used to test the project application.

## 7. Conclusion

In conclusion, phase 2 updated the Fabulari with new function and features from phase 1 prototype into connecting the MEAN-stack application altogether. MongoDB is implemented for it to store application data based on real time. Express and Node.js will work with the server API, the Angular will provides the client interface, and Socket.IO will give a real- time chat between users. 

The final application contains the main user, Group Admin and Super Admin functions, group requests, identifying and check the age, automated tests and dynamic chat rooms. Some of the features that I planned to implement during the phase 1 plan were not fully met or completed and clearly shown in this phase 2 version, such as fully ban-user from the system and removing user.
