UNCLASSIFIED Page 1 of 253 

UNCLASSIFIED  

![][image1]  
Application Security and Development Security  Technical Implementation Guide 

Version: 4 

Release: 9  

25 Jan 2019 

XSL Release 1/29/2015 Sort by: STIGID   
Description: This Security Technical Implementation Guide is published as a tool to improve the security of  Department of Defense (DoD) information systems. The requirements are derived from the National Institute of  Standards and Technology (NIST) 800-53 and related documents. Comments or proposed revisions to this  document should be sent via e-mail to the following address: disa.stig\_spt@mail.mil. 

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_Group ID (Vulid): V-69239   
Group Title: SRG-APP-000001   
Rule ID: SV-83861r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000010   
Rule Title: The application must provide a capability to limit the number of logon sessions per user. file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 2 of 253 

Vulnerability Discussion: Application management includes the ability to control the number of users and user  sessions that utilize an application. Limiting the number of allowed users and sessions per user is helpful in  limiting risks related to DoS attacks. 

This requirement may be met via the application or by utilizing information system session control provided by a  web server or other underlying solution that provides specialized session management capabilities. 

If it has been specified that this requirement will be handled by the application, the capability to limit the  maximum number of concurrent single user sessions must be designed and built into the application. 

This requirement addresses concurrent sessions for individual system accounts and does not address concurrent  sessions by single users via multiple system accounts. 

The maximum number of concurrent sessions should be defined based upon mission needs and the operational  environment for each system. 

Mitigations:   
APSC-DV-000010 

Mitigation Control:   
Use web or application server session management capabilities to limit the number of user application sessions or  build session management capabilities into the application. 

Check Content:   
For production environments; Review the system documentation, identify the number of application user logon  sessions allowed per user, identify the methods utilized for user session management or have application  administrator describe how the application implements user session management. 

Utilize the management interface that is used to set the user session values, or examine configuration files in order  to review user session configuration settings. 

Ensure the number of sessions allowed per user is specified in accordance with the organizational requirements. 

For development environments; have the developer provide design documentation or demonstrate how the  application is designed to limit the number of simultaneous user logon sessions. 

If the application is not configured to limit the number of logon sessions per user as defined by the organization,  this is a finding. 

Fix Text: Design and configure the application to specify the number of logon sessions that are allowed per user. 

CCI: CCI-000054   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69241   
Group Title: SRG-APP-000295   
Rule ID: SV-83863r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000060   
Rule Title: The application must clear temporary storage and cookies when the session is terminated. 

Vulnerability Discussion: Persistent cookies are a primary means by which a web application will store  application state and user information. Since HTTP is a stateless protocol, this persistence allows the web  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 3 of 253 

application developer to provide a robust and customizable user experience. 

However, if a web application stores user authentication information within a persistent cookie or other temporary  storage mechanism, this information can be stolen and used to compromise the users account. 

Likewise, HTML 5 provides the developer with a client storage capability where application data larger than the  4K cookie size limit can be stored on the local client. While this can be beneficial to the developer, this is  considered insecure storage and should not be used for storing sensitive session or security tokens. A cross site  scripting attack can put this data at risk. 

Web applications must clear sensitive data from files and storage areas on the client when the session is  terminated. 

Check Content:   
Review application design documentation and interview application administrator to identify how the application  makes use of temporary client storage and cookies. Identify cookie and web storage locations on the client. Clear  all browser cookies and web cache. 

Log on to the application and perform several standard operations, noting if the application ever prompts the user  to accept a cookie. If prompted by the browser to save the user ID and password (decline to save the user ID and  password), this is a finding.  

Log out of the application and close the browser. Reopen the browser and examine the stored cookies. The cookies  displayed should be related to the application website. 

The procedure to view cookies will vary according to the browser used. Some modern browsers are making use of  SQLite databases to store cookie data so use of a SQLite db reader/browser may be required. 

Open the cookies related to the application website and search for any identification or authentication information.  While authentication information can vary on a per application basis, this is most often specified as "username=x",  or "password=x". 

If the web application prompts the user to save their password, or if a username or password value exists within a  cookie or within local storage locations, even if hashed, this is a finding. 

The application may use means other than cookies to store user information. If the reviewer detects an alternative  mechanism for storing information locally, examine the data storage to ensure no authentication or other sensitive  information is present. 

Fix Text: Design and configure the application to clear sensitive data from cookies and local storage when the  user logs out of the application. 

CCI: CCI-002361   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69243   
Group Title: SRG-APP-000295   
Rule ID: SV-83865r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000070   
Rule Title: The application must automatically terminate the non-privileged user session and log off non privileged users after a 15 minute idle time period has elapsed. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 4 of 253 

Vulnerability Discussion: Leaving a user’s application session established for an indefinite period of time  increases the risk of session hijacking. 

Session termination terminates an individual user's logical application session after 15 minutes of application  inactivity at which time the user must re-authenticate and a new session must be established if the user desires to  continue work in the application. 

Check Content:   
Ask the application representative to demonstrate the configuration setting where the idle time out value is  defined. 

Alternatively, logon with a regular application user account and let the session sit idle for 15 minutes. Attempt to access the application after 15 minutes of inactivity. 

If the configuration setting is not set to time out user sessions after 15 minutes of inactivity, or if the regular user  session used for testing does not time out after 15 minutes of inactivity, this is a finding. 

Fix Text: Design and configure the application to terminate the non-privileged users session after 15 minutes of  inactivity. 

CCI: CCI-002361   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69245   
Group Title: SRG-APP-000295   
Rule ID: SV-83867r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000080   
Rule Title: The application must automatically terminate the admin user session and log off admin users after a 10  minute idle time period is exceeded. 

Vulnerability Discussion: Leaving an admin user's application session established for an indefinite period of  time increases the risk of session hijacking. 

Session termination terminates an individual user's logical application session after 10 minutes of application  inactivity at which time the user must re-authenticate and a new session must be established if the user desires to  continue work in the application. 

Check Content:   
Ask the application representative to demonstrate the application configuration setting where the idle time out  value is defined for admin users. 

Alternatively, logon with an admin user account and let the session sit idle for 10 minutes. 

Attempt to access the application after 10 minutes of inactivity. 

If the configuration setting is not set to time out admin user sessions after 10 minutes of inactivity, or if the session  used for testing does not time out after 10 minutes of inactivity, this is a finding. 

Fix Text: Design and configure the application to terminate the admin users session after 10 minutes of inactivity. file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 5 of 253 

CCI: CCI-002361   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69247   
Group Title: SRG-APP-000296   
Rule ID: SV-83869r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000090   
Rule Title: Applications requiring user access authentication must provide a logoff capability for user initiated  communication session. 

Vulnerability Discussion: If a user cannot explicitly end an application session, the session may remain open and  be exploited by an attacker. Applications providing user access must provide the ability for users to manually  terminate their sessions and log off. 

Check Content:   
If the application does not provide an interface for interactive user access, this is not applicable. 

Log on to the application with a valid user account. Examine the user interface. Identify the command or link that  provides the logoff function. 

Activate the user logoff function. 

Observe user interface and attempt to interact with the application. Confirm user interaction with the application is  no longer possible. 

If the user session is not terminated or if the logoff function does not exist, this is a finding. 

Fix Text: Design and configure the application to provide all users with the capability to manually terminate their  application session. 

CCI: CCI-002363   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69249   
Group Title: SRG-APP-000297   
Rule ID: SV-83871r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000100   
Rule Title: The application must display an explicit logoff message to users indicating the reliable termination of  authenticated communications sessions. 

Vulnerability Discussion: If a user is not explicitly notified that their application session has been terminated,  they cannot be certain that their session did not remain open. Applications with a user access interface must  provide an explicit logoff message to the user upon successful termination of the user session. 

Check Content:   
If the application does not provide an interface for interactive user access, this is not applicable. Log on to the application with a valid user account. Examine the user interface. Identify the command or link that  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 6 of 253 

provides the logoff function. 

Activate the user logoff function. 

If the application does not provide an explicit logoff message indicating the user session has been terminated, this  is a finding. 

Fix Text: Design and configure the application to provide an explicit logoff message to users indicating a  successful logoff has occurred upon user session termination. 

CCI: CCI-002364   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69251   
Group Title: SRG-APP-000311   
Rule ID: SV-83873r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000110   
Rule Title: The application must associate organization-defined types of security attributes having organization defined security attribute values with information in storage. 

Vulnerability Discussion: Without the association of security attributes to information, there is no basis for the  application to make security related access-control decisions. 

Security attributes are abstractions representing the basic properties or characteristics of an entity (e.g., subjects  and objects) with respect to safeguarding information. 

These attributes are typically associated with internal data structures (e.g., records, buffers, files) within the  information system and are used to enable the implementation of access control and flow control policies, reflect  special dissemination, handling or distribution instructions, or support other aspects of the information security  policy. 

One example includes marking data as classified or FOUO. These security attributes may be assigned manually or  during data processing but either way, it is imperative these assignments are maintained while the data is in  storage. If the security attributes are lost when the data is stored, there is the risk of a data compromise. 

Classify the system hosting the application with default classification. Treat all unmarked data at the highest  classification as the overall hosting system is classified. If there is no classification, mark system high. 

Mitigations:   
APSC-DV-000110 

Mitigation Control:   
Classify the system hosting the application with default classification. Treat all unmarked data at the highest  classification as the overall hosting system is classified. 

If there is no classification, mark system high. 

Create POAM documentation and plan to create and retain data markings within application. 

Check Content:   
Review the application documentation and interview the application administrator. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 7 of 253 

Determine if the application processes classified, FOUO, or other data that is required to be marked and identify if  the application requirements specify data markings of any other types of data. 

If the application does not contain classified, FOUO, or other data that is required to be marked, this requirement  is not applicable. 

Review the database or other storage mechanism and have the application administrator identify and demonstrate  how the application assigns and maintains data markings while the data is in storage. 

Typical methods for marking data include utilizing a table or data base field that contains the marking information  and associating the marking information with the data. 

If application data required to be marked is not marked and does not retain its marking while it is being stored, this  is a finding. 

Fix Text: Design and configure the application to assign data marking and ensure the marking is retained when  the data is stored. 

CCI: CCI-002262   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69253   
Group Title: SRG-APP-000313   
Rule ID: SV-83875r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000120   
Rule Title: The application must associate organization-defined types of security attributes having organization defined security attribute values with information in process. 

Vulnerability Discussion: Without the association of security attributes to information, there is no basis for the  application to make security related access-control decisions. 

Security attributes are abstractions representing the basic properties or characteristics of an entity (e.g., subjects  and objects) with respect to safeguarding information. 

These attributes are typically associated with internal data structures (e.g., records, buffers, files) within the  information system and are used to enable the implementation of access control and flow control policies, reflect  special dissemination, handling or distribution instructions, or support other aspects of the information security  policy. 

One example includes marking data as classified or FOUO. These security attributes may be assigned manually or  during data processing but either way, it is imperative these assignments are maintained while the data is in  process. If the security attributes are lost when the data is being processed, there is the risk of a data compromise. 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify if the application requirements include data marking. Also determine if the application processes  classified, FOUO or other data that is required to be marked. 

If the application does not contain classified, FOUO or have data marking requirements, this requirement is not  applicable. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 8 of 253 

Access the user interface for the application and navigate through the application. Perform several application  actions that will manipulate data contained within the application. 

For example, create a test record and assign a data marking to the data element. Save the test record, close the data  entry fields and navigate to display the test record. Perform an edit action on the test data that does not edit the  marking itself or perform any other form of data processing such as assigning the data to another users work queue  for review or printing the data, ensure the data marking is retained throughout the data processing actions. 

If application data required to be marked does not retain its marking while it is being processed by the application,  this is a finding. 

Fix Text: Design and configure the application to retain the data marking when processing data. 

CCI: CCI-002263   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69255   
Group Title: SRG-APP-000314   
Rule ID: SV-83877r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000130   
Rule Title: The application must associate organization-defined types of security attributes having organization defined security attribute values with information in transmission. 

Vulnerability Discussion: Without the association of security attributes to information, there is no basis for the  application to make security related access-control decisions. 

Security attributes are abstractions representing the basic properties or characteristics of an entity (e.g., subjects  and objects) with respect to safeguarding information. 

These attributes are typically associated with internal data structures (e.g., records, buffers, files) within the  information system and are used to enable the implementation of access control and flow control policies, reflect  special dissemination, handling or distribution instructions, or support other aspects of the information security  policy. 

One example includes marking data as classified or FOUO. These security attributes may be assigned manually or  during data processing but either way, it is imperative these assignments are maintained while the data is in  transmission. If the security attributes are lost when the data is being transmitted, there is the risk of a data  compromise. 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify if the application requirements include data marking also determine if the application processes classified,  FOUO or other data that is required to be marked. 

Access the user interface for the application and navigate through the application. Perform an application action  that will transmit marked data that is contained within the application. 

If the application does not contain classified, FOUO or have data marking requirements, or if the application does  not transmit data, this requirement is not applicable. 

E.g., create a test record and assign a data marking to the data element. Save the test record, close the data entry  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 9 of 253 

fields and navigate to display the test record. Initiate the application processes to transmit data. Access remote  system or have person with access to remote system verify the data marking is retained after the data transmission. 

If application data required to be marked does not retain its marking when it is being transmitted by the  application, this is a finding. 

Fix Text: Design and configure the application to retain the data marking when transmitting data. 

CCI: CCI-002264   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69257   
Group Title: SRG-APP-000014   
Rule ID: SV-83879r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000160   
Rule Title: The application must implement DoD-approved encryption to protect the confidentiality of remote  access sessions. 

Vulnerability Discussion: Without confidentiality protection mechanisms, unauthorized individuals may gain  access to sensitive information via a remote access session. 

Remote access is access to DoD nonpublic information systems by an authorized user (or an information system)  communicating through an external, non-organization-controlled network. Remote access methods include, for  example, dial-up, broadband, and wireless. 

Encryption provides a means to secure the remote connection to prevent unauthorized access to the data traversing  the remote access connection thereby providing a degree of confidentiality. The encryption strength of mechanism  is selected based on the security categorization of the information. 

Check Content:   
Review the application documentation and interview the system administrator. 

Identify the application encryption capabilities and methods for implementing encryption protection. 

For web based applications; open the web browser and access the website URL. Use the browser and determine if  the session is protected via TLS. A secure connection is usually indicated in the upper left hand corner of the URL  by a padlock icon. Click on the padlock icon and examine the connection information. Determine if TLS  encryption is used to secure the session. 

For non-web based applications, determine the TCP/IP port, protocol and method used for establishing client  connections to the remote server. Review application configuration settings to ensure encryption is specified and  via TLS. 

If the connection is not secured with TLS, this is a finding. 

Fix Text: Design and configure applications to use TLS encryption to protect the confidentiality of remote access  sessions. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 10 of 253 

Group ID (Vulid): V-69259   
Group Title: SRG-APP-000015   
Rule ID: SV-83881r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000170   
Rule Title: The application must implement cryptographic mechanisms to protect the integrity of remote access  sessions. 

Vulnerability Discussion: Without integrity protection mechanisms, unauthorized individuals may gain access to  sensitive information via a remote access session. 

Remote access is access to DoD nonpublic information systems by an authorized user (or an information system)  communicating through an external, non-organization-controlled network. Remote access methods include, for  example, dial-up, broadband, and wireless. 

Encryption provides a means to secure the remote connection to prevent unauthorized access to the data traversing  the remote access connection. Without integrity protection mechanisms, unauthorized individuals may be able to  insert inauthentic content into a remote session. The encryption strength of mechanism is selected based on the  security categorization of the information. 

Check Content:   
Review the application documentation and interview the system administrator. 

Identify the application encryption capabilities and methods for implementing encryption protection. 

For web based applications; open the web browser and access the website URL. Use the browser and determine if  the session is protected via TLS. A secure connection is usually indicated in the upper left hand corner of the URL  by a padlock icon. Click on the padlock icon and examine the connection information. Determine if TLS  encryption is used to secure the session. 

For non-web based applications, determine the TCP/IP port, protocol and method used for establishing client  connections to the remote server. Review application configuration settings to ensure encryption is specified and  via TLS. 

If the connection is not secured with TLS, this is a finding. 

Fix Text: Design and configure applications to use TLS encryption to protect the integrity of remote access  sessions. 

CCI: CCI-001453   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69261   
Group Title: SRG-APP-000015   
Rule ID: SV-83883r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000180   
Rule Title: Applications with SOAP messages requiring integrity must include the following message  elements:-Message ID-Service Request-Timestamp-SAML Assertion (optionally included in messages) and all  elements of the message must be digitally signed. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 11 of 253 

Vulnerability Discussion: Digitally signed SOAP messages provide message integrity and authenticity of the  signer of the message independent of the transport layer. Service requests may be intercepted and changed in  transit and the data integrity may be at risk if the SOAP message is not digitally signed. 

Functional architecture aspects of the application security plan identify the application data elements that require  data integrity protection. 

Check Content:   
Review the application documentation, system security plan, application architecture diagrams and interview the  application administrator. 

Review the design document for web services using SOAP messages. 

If the application does not utilize SOAP messages, this check is not applicable. 

Review the design document and SOAP messages.   
Verify the Message ID, Service Request, Timestamp, and SAML Assertion are included in the SOAP message. If they are included, verify they are signed with a certificate. 

If SOAP messages requiring integrity do not have the Message ID, Service Request, Timestamp, and SAML  Assertion signed, or if any part of the message is not digitally signed, this is a finding. 

Fix Text: Design and configure the application to sign the following message elements for SOAP messages  requiring integrity: 

\- Message ID   
\- Service Request   
\- Timestamp   
\- SAML Assertion   
\- Message elements 

CCI: CCI-001453   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69279   
Group Title: SRG-APP-000014   
Rule ID: SV-83901r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000190   
Rule Title: Messages protected with WS\_Security must use time stamps with creation and expiration times. 

Vulnerability Discussion: The lack of time stamps could lead to the eventual replay of the message, leaving the  application susceptible to replay events which may result in an immediate loss of confidentiality. 

Check Content:   
Ask the application representative for the design document. Review the design document for web services using  WS-Security tokens. 

If the application does not utilize WS-Security tokens, this check is not applicable. 

Examine the contents of a SOAP message using WS Security; all messages should contain time stamps, sequence  numbers, and expiration. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 12 of 253 

If messages using WS Security do not contain time stamps, sequence numbers, and expiration, this is a finding. 

Fix Text: Design and configure applications using WS-Security messages to use time stamps with creation and  expiration times and sequence numbers. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69281   
Group Title: SRG-APP-000014   
Rule ID: SV-83903r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000200   
Rule Title: Validity periods must be verified on all application messages using WS-Security or SAML assertions. 

Vulnerability Discussion: When using WS-Security in SOAP messages, the application should check the validity  of the time stamps with creation and expiration times. Time stamps that are not validated may lead to a replay  event and provide immediate unauthorized access of the application. Unauthorized access results in an immediate  loss of confidentiality. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services. 

If the application does not utilize WSS or SAML assertions, this requirement is not applicable. 

Review the design document and verify validity periods are checked on all messages using WS-Security or SAML  assertions. 

If the design document does not exist, or does not indicate validity periods are checked on messages using WS Security or SAML assertions, this is a finding. 

Fix Text: Design and configure the application to use validity periods, ensure validity periods are verified on all  WS-Security token profiles and SAML Assertions. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69283   
Group Title: SRG-APP-000014   
Rule ID: SV-83905r2\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000210   
Rule Title: The application must ensure each unique asserting party provides unique assertion ID references for  each SAML assertion. 

Vulnerability Discussion: SAML is a standard for exchanging authentication and authorization data between  security domains. SAML uses security tokens containing assertions to pass information about a principal (usually  an end user) between a SAML authority, (identity provider), and a SAML consumer, (service provider). SAML  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 13 of 253 

assertions are usually made about a subject, (user) represented by the \<Subject\> element. SAML assertion  identifiers should be unique across a system implementation. Duplicate SAML assertion identifiers could lead to  unauthorized access to a web service. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services using SAML assertions. 

If the application does not utilize SAML assertions, this check is not applicable. 

Review the design document and verify SAML assertion identifiers are not reused by a single asserting party. 

If the design document does not exist, or does not indicate SAML assertion identifiers which are unique for each  asserting party, this is a finding. 

Fix Text: Design and configure each SAML assertion authority to use unique assertion identifiers. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69285   
Group Title: SRG-APP-000014   
Rule ID: SV-83907r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000220   
Rule Title: The application must ensure encrypted assertions, or equivalent confidentiality protections are used  when assertion data is passed through an intermediary, and confidentiality of the assertion data is required when  passing through the intermediary. 

Vulnerability Discussion: SAML is a standard for exchanging authentication and authorization data between  security domains. SAML uses security tokens containing assertions to pass information about a principal (usually  an end user) between a SAML authority, (identity provider), and a SAML consumer, (service provider). SAML  assertions are usually made about a subject, (user) represented by the \<Subject\> element.  

The confidentially of the data in a message as the message is passed through an intermediary web service may be  required to be restricted by the intermediary web service. The intermediary web service may leak or distribute the  data contained in a message if not encrypted or protected. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services using WS-Security tokens.  

If the application does not utilize WS-Security tokens, this check is not applicable. 

Verify all WS-Security tokens are transmitted via an approved encryption method. 

If the design document does not exist, or does not indicate all WS-Security tokens are only transmitted via an  approved encryption method, this is a finding. 

Fix Text: Encrypt assertions or use equivalent confidentiality when sensitive assertion data is passed through an  intermediary. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 14 of 253 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69287   
Group Title: SRG-APP-000014   
Rule ID: SV-83909r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000230   
Rule Title: The application must use the NotOnOrAfter condition when using the SubjectConfirmation element in  a SAML assertion. 

Vulnerability Discussion: SAML is a standard for exchanging authentication and authorization data between  security domains. SAML uses security tokens containing assertions to pass information about a principal (usually  an end user) between a SAML authority, (identity provider), and a SAML consumer, (service provider). SAML  assertions are usually made about a subject, (user) represented by the \<Subject\> element. 

When a SAML assertion is used with a \<SubjectConfirmation\> element, a begin and end time for the  \<SubjectConfirmation\> should be set to prevent reuse of the message at a later time. Not setting a specific time  period for the \<SubjectConfirmation\>, may grant immediate access to an attacker and result in an immediate loss  of confidentiality. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services using SAML assertions. 

If the application does not utilize SAML assertions, this check is not applicable. 

Examine the contents of a SOAP message using the \<SubjectConfirmation\> element. All messages should contain  the \<NotOnOrAfter\> element. This can be accomplished if the application allows the ability to view XML  messages or via a protocol analyzer like Wireshark. 

If SOAP messages do not contain \<NotOnOrAfter\> elements, this is a finding. 

Fix Text: Design and configure the application to use the \<NotOnOrAfter\> condition when using the  \<SubjectConfirmation\> element in a SAML assertion. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69289   
Group Title: SRG-APP-000014   
Rule ID: SV-83911r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000240   
Rule Title: The application must use both the NotBefore and NotOnOrAfter elements or OneTimeUse element  when using the Conditions element in a SAML assertion. 

Vulnerability Discussion: SAML is a standard for exchanging authentication and authorization data between  security domains. SAML uses security tokens containing assertions to pass information about a principal (usually  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 15 of 253 

an end user) between a SAML authority, (identity provider), and a SAML consumer, (service provider). SAML  assertions are usually made about a subject, (user) represented by the \<Subject\> element. 

When a SAML assertion is used with a \<Conditions\> element, a begin and end time for the \<Conditions\> element  should be set in order to specify a timeframe in which the assertion is valid. Not setting a specific time period for  the \<Conditions\> element, the possibility exists of granting immediate access or elevated privileges to an attacker  which results in an immediate loss of confidentiality. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services using SAML assertions. 

If the application does not utilize SAML assertions, this check is not applicable. 

Examine the contents of a SOAP message using the \<Conditions\> element; all messages should contain the  \<NotBefore\> and \<NotOnOrAfter\> or \<OneTimeUse\> element when in a SAML Assertion. This can be  accomplished using a protocol analyzer such as Wireshark. 

If SOAP using the \<Conditions\> element does not contain \<NotBefore\> and \<NotOnOrAfter\> or \<OneTimeUse\>  elements, this is a finding. 

Fix Text: Design and configure the application to implement the use of the \<NotBefore\> and \<NotOnOrAfter\> or  \<OneTimeUse\> when using the \<Conditions\> element in a SAML assertion. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69291   
Group Title: SRG-APP-000014   
Rule ID: SV-83913r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000250   
Rule Title: The application must ensure if a OneTimeUse element is used in an assertion, there is only one of the  same used in the Conditions element portion of an assertion. 

Vulnerability Discussion: Multiple \<OneTimeUse\> elements used in a SAML assertion can lead to elevation of  privileges, if the application does not process SAML assertions correctly. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services using SAML assertions. 

If the application does not utilize SAML assertions, this check is not applicable. 

Examine the contents of a SOAP message using the OneTimeUse element; all messages should contain only one  instance of a \<OneTimeUse\> element in a SAML assertion. This can be accomplished using a protocol analyzer  such as Wireshark. 

If SOAP message uses more than one, OneTimeUse element in a SAML assertion, this is a finding. Fix Text: When using OneTimeUse elements in a SAML assertion only allow one, OneTimeUse element to be  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 16 of 253 

used in the conditions element of a SAML assertion. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69293   
Group Title: SRG-APP-000014   
Rule ID: SV-83915r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000260   
Rule Title: The application must ensure messages are encrypted when the SessionIndex is tied to privacy data. 

Vulnerability Discussion: When the SessionIndex is tied to privacy data (e.g., attributes containing privacy data)  the message should be encrypted. If the message is not encrypted there is the possibility of compromise of privacy  data. 

Check Content:   
Ask the application representative for the design document. 

Review the design document for web services using SAML assertions. 

If the application does not utilize SAML assertions, this check is not applicable. 

Examine the contents of a SOAP message using a SessionIndex in the SAML element AuthnStatement. Verify the  information which is tied to the SessionIndex. 

If the SessionIndex is tied to privacy information, and it is not encrypted, this is a finding. 

Fix Text: Encrypt messages when the SessionIndex is tied to privacy data. 

CCI: CCI-000068   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69295   
Group Title: SRG-APP-000023   
Rule ID: SV-83917r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000280   
Rule Title: The application must provide automated mechanisms for supporting account management functions. 

Vulnerability Discussion: Enterprise environments make application account management challenging and  complex. A manual process for account management functions adds the risk of a potential oversight or other error. 

Manual examples include but are not limited to admin staff logging into the system or systems and manually  performing step by step actions affecting user accounts that could otherwise be automated. This does not include  any manual steps taken to initiate automated processes or the use of automated systems. 

A comprehensive application account management process that includes automation helps to ensure accounts  designated as requiring attention are consistently and promptly addressed. Examples include, but are not limited  to, using automation to take action on multiple accounts designated as inactive, suspended or terminated or by  disabling accounts located in non-centralized account stores such as multiple servers. This requirement applies to  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 17 of 253 

all account types, including individual/user, shared, group, system, guest/anonymous, emergency,  developer/manufacturer/vendor, temporary, and service. 

The application must be configured to automatically provide account management functions and these functions  must immediately enforce the organization's current account policy. The automated mechanisms may reside  within the application itself or may be offered by the operating system or other infrastructure providing automated  account management capabilities. Automated mechanisms may be comprised of differing technologies that when  placed together contain an overall automated mechanism supporting an organization's automated account  management requirements. 

Account management functions include: assignment of group or role membership; identifying account type;  specifying user access authorizations (i.e., privileges); account removal, update, or termination; and administrative  alerts. The use of automated mechanisms can include, for example: using email or text messaging to automatically  notify account managers when users are terminated or transferred; using the information system to monitor  account usage; and using automated telephonic notification to report atypical system account usage. 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify the account management methods, processes and procedures that are used. 

If the application is utilizing a centralized authentication mechanism such as Active Directory or LDAP, verify all  user account activity is conducted via that solution and no local user accounts that circumvent the automated  solution are used. 

Determine if automated mechanisms are used when managing application user accounts and taking management  action on application user accounts. Automated methods include but are not limited to: 

Taking action on accounts that have been determined to be inactive, suspended, terminated, or disabled. 

Automated action examples include: deleting such accounts, reactivating accounts in conjunction with a validation  or verification process, or sending notifications or reminders to the account holders that their account is about to  be disabled or deleted. 

Verify the action that is taken is automated and repeatable. 

If the account management process is manual in nature, this is a finding. 

Fix Text: Use automated processes and mechanisms for account management functions. 

CCI: CCI-000015   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69297   
Group Title: SRG-APP-000317   
Rule ID: SV-83919r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000290   
Rule Title: Shared/group account credentials must be terminated when members leave the group. 

Vulnerability Discussion: If shared/group account credentials are not terminated when individuals leave the  group, the user that left the group can still gain access even though they are no longer authorized. A shared/group  account credential is a shared form of authentication that allows multiple individuals to access the application  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 18 of 253 

using a single account. There may also be instances when specific user actions need to be performed on the  information system without unique user identification or authentication. Examples of credentials include  passwords and group membership certificates. 

Check Content:   
Review the application documentation and determine if there is a requirement for shared or group accounts. If there is no official requirement for shared or group application accounts, this requirement is not applicable. Interview the application representative and identify shared/group accounts. 

Have the application representative provide their procedures for account management as it pertains to group users. 

Validate there is a procedure for deleting either member accounts or the entire group account when member leave  the group. 

If there is no process for handling group account credentials, this is a finding. 

Fix Text: Create a procedure for deleting either member accounts or the entire group account when members  leave the group. 

CCI: CCI-002142   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69299   
Group Title: SRG-APP-000024   
Rule ID: SV-83921r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000300   
Rule Title: The application must automatically remove or disable temporary user accounts 72 hours after account  creation. 

Vulnerability Discussion: If temporary user accounts remain active when no longer needed or for an excessive  period, these accounts may be used to gain unauthorized access. To mitigate this risk, automated termination of all  temporary accounts must be set upon account creation. 

Temporary accounts are established as part of normal account activation procedures when there is a need for  short-term accounts without the demand for immediacy in account activation. 

If temporary accounts are used, the application must be configured to automatically terminate these types of  accounts after a DoD-defined time period of 72 hours starting from the point of account creation. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access mechanisms meeting or exceeding access control policy requirements. Such  integration allows the application developer to off-load those access control functions and focus on core  application features and functionality. 

Check Content:   
If official documentation exist that disallows the use of temporary user accounts within the application, this  requirement is not applicable. 

Examine the application documentation or interview the application representative to identify how the application  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 19 of 253 

users are managed. 

Navigate to the screen where user accounts are configured. 

Create a test account and determine if there is a setting to specify the user account as being temporary in nature. Determine if there is an available setting to expire the account after a period of time. 

If the application has no ability to specify a user account as being temporary in nature, or if the account has no  ability to automatically disable or remove the account after 72 hours after account creation, this is a finding. 

Fix Text: Configure temporary accounts to be automatically removed or disabled after 72 hours after account  creation. 

CCI: CCI-000016   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-70173   
Group Title: ASDV-PL-000310   
Rule ID: SV-84795r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000310   
Rule Title: The application must have a process, feature or function that prevents removal or disabling of  emergency accounts.  

Vulnerability Discussion: Emergency accounts are administrator accounts which are established in response to  crisis situations where the need for rapid account activation is required. Therefore, emergency account activation  may bypass normal account authorization processes. 

If these accounts are automatically disabled, system maintenance during emergencies may not be possible, thus  adversely affecting system availability. 

Emergency accounts are different from infrequently used accounts (i.e., local logon accounts used by system  administrators when network or normal logon/access is not available). Infrequently used accounts also remain  available and are not subject to automatic termination dates. However, an emergency account is normally a  different account which is created for use by vendors or system maintainers. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access mechanisms that meet or exceed access control policy requirements. Such  integration allows the application developer to off-load those access control functions and focus on core  application features and functionality. 

Check Content:   
Review the application documentation and interview the application administrator. Identify if emergency accounts  are ever used.  

If emergency accounts are not used, this requirement is not applicable. 

If emergency accounts are used, validate a procedure, process, feature or function exists that will prevent the  emergency account from being deleted or disabled during a crisis situation. 

Examples include but are not limited to adding a flag to the account to ensure it is not deleted during a specified  emergency period or placing the account in a designated group that is monitored and controlled in accordance with  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 20 of 253 

the crisis. 

If a process, procedure, function or feature designed to prevent emergency accounts from being deleted or disabled  during a crisis situation is not available, this is a finding. 

Fix Text: Identify accounts that are created in an emergency situation and ensure procedures or processes are in  place to prevent disabling or deleting the account while the emergency is underway. 

CCI: CCI-000011   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69301   
Group Title: SRG-APP-000025   
Rule ID: SV-83923r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000320   
Rule Title: The application must automatically disable accounts after a 35 day period of account inactivity. 

Vulnerability Discussion: Attackers that are able to exploit an inactive account can potentially obtain and  maintain undetected access to an application. Owners of inactive accounts will not notice if unauthorized access to  their user account has been obtained. Applications need to track periods of user inactivity and disable accounts  after 35 days of inactivity. Such a process greatly reduces the risk that accounts will be hijacked, leading to a data  compromise. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access mechanisms that meet or exceed access control policy requirements. Such  integration allows the application developer to off-load those access control functions and focus on core  application features and functionality. 

This policy does not apply to either emergency accounts or infrequently used accounts. Infrequently used accounts  are local logon administrator accounts used by system administrators when network or normal logon/access is not  available. Emergency accounts are administrator accounts created in response to crisis situations. 

Check Content:   
Examine the application documentation or interview the application representative to identify how the application  users are managed. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory (AD) for user management or if the application manages user accounts  within the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

If the application handles the management tasks for user accounts, access the applications user management  utility. 

Navigate to the screen where user accounts are configured to be disabled after 35 days of inactivity. Confirm this setting is active. 

If the application is not set to expire inactive accounts after 35 days, or if the application has no ability to expire  accounts after 35 days of inactivity, this is a finding. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 21 of 253 

Fix Text: Design and configure the application to expire user accounts after 35 days of inactivity. 

CCI: CCI-000017   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69303   
Group Title: SRG-APP-000025   
Rule ID: SV-83925r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000330   
Rule Title: Unnecessary application accounts must be disabled, or deleted. 

Vulnerability Discussion: Test or demonstration accounts are sometimes created during the application  installation process. This creates a security risk as these accounts often remain after the initial installation process  and can be used to gain unauthorized access to the application. Applications must be designed and configured to  disable or delete any unnecessary accounts that may be created.  

Care must be taken to ensure valid accounts used for valid application operations are not disabled or deleted when  this requirement is applied. 

Check Content:   
Review the system documentation and identify any valid application accounts that are required in order for the  application to operate. Accounts the application itself uses in order to function are not in scope for this  requirement. 

Have the application administrator generate a list of all application users. This should include relevant user  metadata such as phone numbers or department identifiers. 

Have the application administrator identify and validate all user accounts. 

If any accounts cannot be validated and are deemed to be unnecessary, this is a finding. 

Fix Text: Design the application so unessential user accounts are not created during installation. Disable or delete  all unnecessary application user accounts. 

CCI: CCI-000017   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69305   
Group Title: SRG-APP-000026   
Rule ID: SV-83927r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000340   
Rule Title: The application must automatically audit account creation. 

Vulnerability Discussion: Once an attacker establishes initial access to a system, the attacker often attempts to  create a persistent method of re-establishing access. One way to accomplish this is for the attacker to simply create  a new account. Auditing of account creation is one method for mitigating this risk. A comprehensive account  management process will ensure an audit trail documents the creation of application user accounts and, as  required, notifies administrators and/or application owners exists. Such a process greatly reduces the risk that  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 22 of 253 

accounts will be surreptitiously created and provides logging that can be used for forensic purposes. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access/auditing mechanisms meeting or exceeding access control policy  requirements. Such integration allows the application developer to off-load those access control functions and  focus on core application features and functionality. 

Check Content:   
Examine the application documentation to identify how the application users are managed. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Identify the location of the audit logs and review the end of the logs. 

Access the user account management functionality and create a new user account. 

Examine the log file again and determine if the account creation event was logged. The information logged  should, at a minimum, include enough detail to determine which account was created and when. 

If the account creation event was not logged, this is a finding. 

Fix Text: Configure the application to write a log entry when a new user account is created. 

At a minimum, ensure account name, date and time of the event are recorded. 

CCI: CCI-000018   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69307   
Group Title: SRG-APP-000027   
Rule ID: SV-83929r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000350   
Rule Title: The application must automatically audit account modification. 

Vulnerability Discussion: One way for an attacker to establish persistent access is for the attacker to modify or  copy an existing account. Auditing of account modification is one method for mitigating this risk. A  comprehensive account management process will ensure an audit trail documents the modification of application  user accounts. Such a process greatly reduces the risk that accounts will be surreptitiously modified and provides  logging that can be used for forensic purposes. 

To address account requirements and to ensure application accounts follow requirements consistently, application  developers are strongly encouraged to integrate their applications with enterprise-level  

authentication/access/auditing mechanisms that meet or exceed access control policy requirements. Such  integration allows the application developer to off-load those access control functions and focus on core  application features and functionality. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 23 of 253 

Check Content:   
Examine the application documentation to identify how the application users are managed. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Identify the location of the audit logs and review the end of the logs. 

Access the user account management functionality and modify a test user account. 

Examine the log file again and determine if the account event was logged. The information logged should, at a  minimum, include enough detail to determine which account was modified and when. 

If the account modification event information was not logged, this is a finding. 

Fix Text: Configure the application to write a log entry when a user account is modified. 

At a minimum, ensure account name, date and time of the event are recorded. 

CCI: CCI-001403   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69309   
Group Title: SRG-APP-000028   
Rule ID: SV-83931r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000360   
Rule Title: The application must automatically audit account disabling actions. 

Vulnerability Discussion: When application accounts are disabled, user accessibility is affected. Accounts are  utilized for identifying individual application users or for identifying the application processes themselves. In  order to detect and respond to events affecting user accessibility and application processing, applications must  audit account disabling actions and, as required, notify the appropriate individuals, so they can investigate the  event. Such a capability greatly reduces the risk that application accessibility will be negatively affected for  extended periods of time and provides logging that can be used for forensic purposes.  

Application developers are encouraged to integrate their applications with enterprise-level    
authentication/access/audit mechanisms such as Syslog, Active Directory or LDAP. 

Check Content:   
Examine the application documentation to identify how the application users are managed. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 24 of 253 

Identify the location of the audit logs and review the end of the logs. 

Access the user account management functionality and disable a test user account. 

Examine the log file again and determine if the account disable event was logged. The information logged should,  at a minimum, include enough detail to determine which account was disabled and when. 

If the account disabling event information was not logged, this is a finding. 

Fix Text: Configure the application to write a log entry when a user account is disabled. 

At a minimum, ensure account name, date and time of the event are recorded. 

CCI: CCI-001404   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69311   
Group Title: SRG-APP-000029   
Rule ID: SV-83933r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000370   
Rule Title: The application must automatically audit account removal actions. 

Vulnerability Discussion: When application accounts are removed, user accessibility is affected. Accounts are  utilized for identifying individual application users or for identifying the application processes themselves. In  order to detect and respond to events affecting user accessibility and application processing, applications must  audit account removal actions and, as required, notify the appropriate individuals, so they can investigate the  event. Such a capability greatly reduces the risk that application accessibility will be negatively affected for  extended periods of time and provides logging that can be used for forensic purposes. 

Application developers are encouraged to integrate their applications with enterprise-level    
authentication/access/audit mechanisms such as Syslog, Active Directory or LDAP. 

Check Content:   
Examine the application documentation to identify how the application users are managed. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Identify the location of the audit logs and review the end of the logs. 

Access the user account management functionality and remove a test user account. 

Examine the log file again and determine if the account removal event was logged. The information logged  should, at a minimum, include enough detail to determine which account was disabled and when. 

If the account removal event information was not logged, this is a finding. 

Fix Text: Configure the application to write a log entry when a user account is removed. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 25 of 253 

At a minimum, ensure account name, date and time of the event are recorded. 

CCI: CCI-001405   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69313   
Group Title: SRG-APP-000291   
Rule ID: SV-83935r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000380   
Rule Title: The application must notify System Administrators and Information System Security Officers when  accounts are created. 

Vulnerability Discussion: Once an attacker establishes access to a system, the attacker often attempts to create a  persistent method of re-establishing access. One way to accomplish this is for the attacker to simply create a new  account. Notification of account creation is one method for mitigating this risk. A comprehensive account  management process will ensure an audit trail which documents the creation of application user accounts and  notifies administrators and Information System Security Officers (ISSO) exists. Such a process greatly reduces the  risk that accounts will be surreptitiously created and provides logging that can be used for forensic purposes. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access/auditing mechanisms that meet or exceed access control policy  requirements. Such integration allows the application developer to off-load those access control functions and  focus on core application features and functionality. 

Check Content:   
Review the application and system documentation. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Ensure the application is configured to notify system administrators when new accounts are created by identifying  system administrators who will be notified when new accounts are created, creating a test account and checking  with system administrator to verify notification was received. 

If system administrators and ISSOs are not notified when accounts are created, this is a finding. 

Fix Text: Configure the application to notify the system administrator and the ISSO when application accounts  are created. 

CCI: CCI-001683   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69315   
Group Title: SRG-APP-000292   
Rule ID: SV-83937r1\_rule 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 26 of 253 

Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000390   
Rule Title: The application must notify System Administrators and Information System Security Officers when  accounts are modified. 

Vulnerability Discussion: Once an attacker establishes access to a system, the attacker often attempts to create a  persistent method of re-establishing access. One way to accomplish this is for the attacker to simply create a new  account. Notification of account creation is one method for mitigating this risk. A comprehensive account  management process will ensure an audit trail which documents the creation of application user accounts and  notifies administrators and Information System Security Officers (ISSO) exists. Such a process greatly reduces the  risk that accounts will be surreptitiously created and provides logging that can be used for forensic purposes. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access/auditing mechanisms that meet or exceed access control policy  requirements. Such integration allows the application developer to off-load those access control functions and  focus on core application features and functionality. 

Check Content:   
Review the application and system documentation. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Ensure the application is configured to notify system administrators when accounts are modified by identifying  system administrators who will be notified when accounts are modified. 

Modify a test account and check with a system administrator to verify notification was received. 

If system administrators and ISSOs are not notified when accounts are modified, this is a finding. 

Fix Text: Configure the application to notify the system administrator and the ISSO when application accounts  are modified. 

CCI: CCI-001684   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69317   
Group Title: SRG-APP-000293   
Rule ID: SV-83939r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000400   
Rule Title: The application must notify System Administrators and Information System Security Officers of  account disabling actions. 

Vulnerability Discussion: Once an attacker establishes access to a system, the attacker often attempts to create a  persistent method of re-establishing access. One way to accomplish this is for the attacker to simply create a new  account. Notification of account creation is one method for mitigating this risk. A comprehensive account  management process will ensure an audit trail which documents the creation of application user accounts and  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 27 of 253 

notifies administrators and Information System Security Officers (ISSO) exists. Such a process greatly reduces the  risk that accounts will be surreptitiously created and provides logging that can be used for forensic purposes.  

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access/auditing mechanisms that meet or exceed access control policy  requirements. Such integration allows the application developer to off-load those access control functions and  focus on core application features and functionality. 

Check Content:   
Review the application and system documentation. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Ensure application is configured to notify system administrators when accounts are disabled by identifying system  administrators who will be notified when accounts are disabled. 

Disable a test account and check with a system administrator to verify notification was received. 

If system administrators and ISSOs are not notified when accounts are disabled, this is a finding. 

Fix Text: Configure the application to notify the system administrator and the ISSO when application accounts  are disabled. 

CCI: CCI-001685   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69319   
Group Title: SRG-APP-000294   
Rule ID: SV-83941r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000410   
Rule Title: The application must notify System Administrators and Information System Security Officers of  account removal actions. 

Vulnerability Discussion: Once an attacker establishes access to a system, the attacker often attempts to create a  persistent method of re-establishing access. One way to accomplish this is for the attacker to simply create a new  account. Notification of account creation is one method for mitigating this risk. A comprehensive account  management process will ensure an audit trail which documents the creation of application user accounts and  notifies administrators and Information System Security Officers (ISSO) exists. Such a process greatly reduces the  risk that accounts will be surreptitiously created and provides logging that can be used for forensic purposes. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access/auditing mechanisms that meet or exceed access control policy  requirements. Such integration allows the application developer to off-load those access control functions and  focus on core application features and functionality. 

Check Content: 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 28 of 253 

Review the application and system documentation. 

Interview the application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Ensure application is configured to notify system administrators when accounts are removed by identifying system  administrators who will be notified when accounts are removed. 

Remove a test account and check with a system administrator to verify notification was received. 

If system administrators and ISSOs are not notified when accounts are removed, this is a finding. 

Fix Text: Configure the application to notify the system administrator and the ISSO when application accounts  are removed. 

CCI: CCI-001686   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69321   
Group Title: SRG-APP-000319   
Rule ID: SV-83943r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000420   
Rule Title: The application must automatically audit account enabling actions. 

Vulnerability Discussion: When application accounts are enabled, user accessibility is affected. Accounts are  utilized for identifying individual application users or for identifying the application processes themselves. In  order to detect and respond to events affecting user accessibility and application processing, applications must  audit account removal actions and, as required, notify the appropriate individuals, so they can investigate the  event. Such a capability greatly reduces the risk that application accessibility will be negatively affected for  extended periods of time and provides logging that can be used for forensic purposes. 

Application developers are encouraged to integrate their applications with enterprise-level    
authentication/access/audit mechanisms such as Syslog, Active Directory or LDAP. 

Check Content:   
Examine the application documentation or interview the application representative to identify how the application  users are managed. 

Identify the location of the audit logs and review the end of the logs. 

Access the user account management functionality and enable a test user account. 

Examine the log file again and determine if the account enable event was logged. The information logged should,  at a minimum, include enough detail to determine which account was enabled and when. 

If the account enabling event information was not logged, this is a finding. 

Fix Text: Configure the application to write a log entry when a user account is enabled.  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 29 of 253 

At a minimum, ensure account name, date and time of the event are recorded. 

CCI: CCI-002130   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69323   
Group Title: SRG-APP-000320   
Rule ID: SV-83945r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000430   
Rule Title: The application must notify System Administrators and Information System Security Officers of  account enabling actions. 

Vulnerability Discussion: Once an attacker establishes access to a system, the attacker often attempts to create a  persistent method of re-establishing access. One way to accomplish this is for the attacker to simply enable an  existing account that has been previously disabled. Notification when account enabling actions occur is one  method for mitigating this risk. A comprehensive account management process will ensure an audit trail which  documents the enabling of application user accounts and notifies administrators and Information System Security  Officers (ISSO) exists. Such a process greatly reduces the risk that accounts will be surreptitiously created and  provides logging that can be used for forensic purposes. 

To address access requirements, many application developers choose to integrate their applications with  enterprise-level authentication/access/auditing mechanisms that meet or exceed access control policy  requirements. Such integration allows the application developer to off-load those access control functions and  focus on core application features and functionality. 

Check Content:   
Review the application and system documentation. 

Interview application administrator and determine if the application is configured to utilize a centralized user  management system like Active Directory for user management or if the application manages user accounts within  the application. 

If the application is configured to use an enterprise-based application user management capability that is STIG  compliant, the requirement is not applicable. 

Ensure application is configured to notify system administrators when accounts are enabled by identifying system  administrators who will be notified when accounts are enabled. 

Disable and then enable a test account and check with system administrator to verify notification was received to  indicate the account was enabled. 

If system administrators and ISSOs are not notified when accounts are enabled, this is a finding. 

Fix Text: Configure the application to notify the system administrator and the ISSO when application accounts  are enabled. 

CCI: CCI-002132   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 30 of 253 

Group ID (Vulid): V-69325   
Group Title: SRG-APP-000323   
Rule ID: SV-83947r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000440   
Rule Title: Application data protection requirements must be identified and documented. 

Vulnerability Discussion: Failure to protect organizational information from data mining may result in a  compromise of information. In order to assign the appropriate data protections, application data must be identified  and then protection requirements assigned. Access to sensitive data and sensitive data objects should be restricted  to those authorized to access the data. 

Examples of sensitive data include but are not limited to; Social Security Numbers, Personally Identifiable  Information, or any other data that is has been identified as being sensitive in nature by the data owner. 

Data storage objects include, for example, databases, database records, and database fields. 

Data mining prevention and detection techniques include, for example: limiting the types of responses provided to  database queries; limiting the number/frequency of database queries to increase the work factor needed to  determine the contents of such databases; and notifying organizational personnel when atypical database queries  or accesses occur. 

Protection methods include but are not limited to data encryption, Role-Based Access Controls and access  authentication. 

Check Content:   
Ask the application representative for the documentation that identifies the application data elements, the  protection requirements, and any associated steps that are being taken to protect the data. 

If the application data protection requirements are not documented, this is a finding. 

Fix Text: Identify and document the application data elements and the data protection requirements. 

CCI: CCI-002346   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69327   
Group Title: SRG-APP-000324   
Rule ID: SV-83949r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000450   
Rule Title: The application must utilize organization-defined data mining detection techniques for organization defined data storage objects to adequately detect data mining attempts. 

Vulnerability Discussion: Failure to protect organizational information from data mining may result in a  compromise of information. 

Data mining occurs when the application is programmatically probed and data is automatically extracted. While  there are valid uses for data mining within data sets, the organization should be mindful that adversaries may  attempt to use data mining capabilities built into the application in order to completely extract application data so  it can be evaluated using methods that are not natively offered by the application. This can provide the adversary  with an opportunity to utilize inference attacks or obtain additional insights that might not have been intended  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 31 of 253 

when the application was designed. 

Methods of extraction include database queries or screen scrapes using the application itself. The entity  performing the data mining must have access to the application in order to extract the data. Data mining attacks  will usually occur with publicly releasable data access but can also occur when access is limited to authorized or  authenticated inside users. 

Data storage objects include, for example, databases, database records, and database fields. 

Data mining prevention and detection techniques include, for example: limiting the types of responses provided to  database queries; limiting the number/frequency of database queries to increase the work factor needed to  determine the contents of such databases; and notifying organizational personnel when atypical database queries  or accesses occur. 

Check Content:   
Review the security plan, application and system documentation and interview the application administrator to  identify data mining protections that are required of the application. 

If there are no data mining protections required, this requirement is not applicable. 

Review the application authentication requirements and permissions. 

Review documented protections that have been established to protect from data mining. 

This can include limiting the number of queries allowed. 

Automated alarming on atypical query events. 

Limiting the number of records allowed to be returned in a query. 

Not allowing data dumps. 

If the application requirements specify protections for data mining and the application administrator is unable to  identify or demonstrate that the protections are in place, this is a finding. 

Fix Text: Utilize and implement data mining protections when requirements specify it. 

CCI: CCI-002347   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69329   
Group Title: SRG-APP-000033   
Rule ID: SV-83951r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000460   
Rule Title: The application must enforce approved authorizations for logical access to information and system  resources in accordance with applicable access control policies. 

Vulnerability Discussion: To mitigate the risk of unauthorized access to sensitive information by entities that  have been issued certificates by DoD-approved PKIs, all DoD systems (e.g., networks, web servers, and web  portals) must be properly configured to incorporate access control methods that do not rely solely on the  possession of a certificate for access.  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 32 of 253 

Successful authentication must not automatically give an entity access to a restricted asset or security boundary. 

Authorization procedures and controls must be implemented to ensure each authenticated entity also has a  validated and current authorization. 

Authorization is the process of determining whether an entity, once authenticated, is permitted to access a specific  asset. 

Information systems use access control policies and enforcement mechanisms to implement this requirement. Access control policies include identity-based policies, role-based policies, and attribute-based policies. Access enforcement mechanisms include access control lists, access control matrices, and cryptography. 

These policies and mechanisms must be employed by the application to control access between users (or processes  acting on behalf of users) and objects (e.g., devices, files, records, processes, programs, and domains) in the  information system. 

This requirement is applicable to access control enforcement applications (e.g., authentication servers) and other  applications that perform information and system access control functions. 

Check Content:   
Review the application documentation and interview the application administrator. 

Review application data protection requirements. 

Identify application resources that require protection and authentication over and above the authentication required  to access the application itself. 

This can be access to a URL, a folder, a file, a process or a database record that should only be available to certain  individuals. 

Identify the access control methods utilized by the application in order to control access to the resource. Examples include Role-Based Access Control policies (RBAC). 

Using RBAC as an example, utilize a test account placed into a test role. 

Set a protection control on a resource and explicitly deny access to the role assigned to the test user account. Try to access an application resource that is not configured to allow access. Access should be denied. 

If the enforcement of configured access restrictions is not performed, this is a finding. 

Fix Text: Design or configure the application to enforce access to application resources. 

CCI: CCI-000213   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69331   
Group Title: SRG-APP-000328   
Rule ID: SV-83953r1\_rule   
Severity: CAT II 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 33 of 253 

Rule Version (STIG-ID): APSC-DV-000470   
Rule Title: The application must enforce organization-defined discretionary access control policies over defined  subjects and objects. 

Vulnerability Discussion: Discretionary Access Control allows users to determine who is allowed to access their  data. To mitigate the risk of unauthorized access to sensitive information by entities that have been issued  certificates by DoD-approved PKIs, all DoD systems (e.g., networks, web servers, and web portals) must be  properly configured to incorporate access control methods that do not rely solely on the possession of a certificate  for access. Successful authentication must not automatically give an entity access to an asset or security boundary.  Authorization procedures and controls must be implemented to ensure each authenticated entity also has a  validated and current authorization. Authorization is the process of determining whether an entity, once  authenticated, is permitted to access a specific asset. Information systems use access control policies and  enforcement mechanisms to implement this requirement. 

Access control policies include identity-based policies, role-based policies, and attribute-based policies. Access  enforcement mechanisms include access control lists, access control matrices, and cryptography. These policies  and mechanisms must be employed by the application to control access between users (or processes acting on  behalf of users) and objects (e.g., devices, files, records, processes, programs, and domains) in the information  system. 

This requirement is applicable to access control enforcement applications (e.g., authentication servers) and other  applications that perform information and system access control functions. 

Check Content:   
Review the application documentation and interview the application administrator. 

Review application data protection requirements and application integrated access control methods. 

Identify if the application implements discretionary access control to application resources. Discretionary Access  Controls (DAC) allows application users to determine and set permissions on application data and application  objects. The result is the user is given the ability to control who has access to the data they control. 

If the application does not implement discretionary access controls, this requirement is not applicable. 

Resources can be a URL, a folder, a file, a process, a database record, or any other application asset that warrants  sharing or authorization permission reassignment. 

Create 3 test accounts. 

Using test account 1 set protection control on a test user 1 controlled resource. 

Grant access to test user 2 and only test user 2. 

Authenticate as test user 3 and attempt to access the application resource where test user 1 and test user 2 are  granted access. Access should be denied. 

If the enforcement of configured access restrictions is not performed, this is a finding. 

Fix Text: Design and configure the application to enforce discretionary access control policies. 

CCI: CCI-002165   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 34 of 253 

Group ID (Vulid): V-69333   
Group Title: SRG-APP-000038   
Rule ID: SV-83955r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000480   
Rule Title: The application must enforce approved authorizations for controlling the flow of information within  the system based on organization-defined information flow control policies. 

Vulnerability Discussion: A mechanism to detect and prevent unauthorized communication flow must be  configured or provided as part of the system design. If information flow is not enforced based on approved  authorizations, the system may become compromised. Information flow control regulates where information is  allowed to travel within a system and between interconnected systems. The flow of all system information must be  monitored and controlled so it does not introduce any unacceptable risk to the systems or data. 

Application specific examples of enforcement occurs in systems that employ rule sets or establish configuration  settings that restrict information system services, or message-filtering capability based on message content (e.g.,  implementing key word searches or using document characteristics). 

This is usually established by identifying if there are rulesets, policies or other configurations settings provided by  the application which serve to control the flow of information within the system. Control of data flow is  established by using labels on data and data subsets, evaluating the destination of the data within or without the  system (similar security domain) and referencing a corresponding policy that is used to control the flow of data. 

Applications providing information flow control must be able to enforce approved authorizations for controlling  the flow of information within the system in accordance with applicable policy. 

Check Content:   
Review the application documentation and interview the application and system administrators. 

Review application features and functions to determine if the application is designed to control the flow of  information within the system. 

Identify: 

\- rulesets,   
\- data labels, and   
\- policies 

to determine if the application is designed to control the flow of data within the system. If the application does not provide data flow control capabilities, the requirement is not applicable. Access the system as a user with access rights that allow the creation of test data or use of existing test data. 

Create a test data set and label the data with a data label provided with or by the application, e.g., Personally  Identifiable Information (PII) data. 

Review the policy to determine where in the system the PII labeled data is allowed and is not allowed to go. 

Using application features and functions, attempt to transmit the labeled data to an area that is prohibited by  policy. 

Verify the flow control policy was enforced and the data was not transmitted. 

If the application does not enforce the approved authorizations for controlling data flow, this is a finding. file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 35 of 253 

Fix Text: Configure the application to enforce data flow control in accordance with data flow control policies. 

CCI: CCI-001368   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69335   
Group Title: SRG-APP-000039   
Rule ID: SV-83957r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000490   
Rule Title: The application must enforce approved authorizations for controlling the flow of information between  interconnected systems based on organization-defined information flow control policies. 

Vulnerability Discussion: A mechanism to detect and prevent unauthorized communication flow must be  configured or provided as part of the system design. If information flow is not enforced based on approved  authorizations, the system may become compromised. Information flow control regulates where information is  allowed to travel within a system and between interconnected systems. The flow of all system information must be  monitored and controlled so it does not introduce any unacceptable risk to the systems or data. 

Application specific examples of enforcement occurs in systems that employ rule sets or establish configuration  settings that restrict information system services, or message-filtering capability based on message content (e.g.,  implementing key word searches or using document characteristics). 

This is usually established by identifying if there are rulesets, policies or other configurations settings provided by  the application which serve to control the flow of information within the system. Control of data flow is  established by using labels on data and data subsets, evaluating the destination of the data within or without the  system (similar security domain) and referencing a corresponding policy that is used to control the flow of data. 

Applications providing information flow control must be able to enforce approved authorizations for controlling  the flow of information within the system in accordance with applicable policy. 

Check Content:   
Review the application documentation and interview the application and system administrators. 

Identify application features and functions to determine if the application is designed to control the flow of  information between interconnected systems. 

Identify: 

\- rulesets,   
\- data labels   
\- policies   
\- systems 

to determine if the application is designed to control the flow of data between interconnected systems. If the application does not provide data flow control capabilities, the requirement is not applicable. Access the system as a user with access rights allowing the creation of test data or use of existing test data. 

Create a test data set and label the data with a data label provided with or by the application (for example, a  Personally Identifiable Information (PII) data label). 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 36 of 253 

Review the policy settings to determine where the PII labeled data is allowed and is not allowed. 

Using application features and functions, attempt to transmit the labeled data to an interconnected system that is  prohibited by policy. 

Verify the flow control policy was enforced and the data was not transmitted. 

If the application does not enforce the approved authorizations for controlling data flow, this is a finding. Fix Text: Configure the application to enforce data flow control in accordance with data flow control policies. 

CCI: CCI-001414   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69337   
Group Title: SRG-APP-000340   
Rule ID: SV-83959r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000500   
Rule Title: The application must prevent non-privileged users from executing privileged functions to include  disabling, circumventing, or altering implemented security safeguards/countermeasures. 

Vulnerability Discussion: Preventing non-privileged users from executing privileged functions mitigates the risk  that unauthorized individuals or processes may gain unnecessary access to information or privileges. 

Privileged functions include, for example, establishing accounts, performing system integrity checks, or  administering cryptographic key management activities. Non-privileged users are individuals that do not possess  appropriate authorizations. Circumventing intrusion detection and prevention mechanisms or malicious code  protection mechanisms are examples of privileged functions that require protection from non-privileged users. 

Check Content:   
Identify the application user account(s) that the application uses to run. These accounts include the application  processes (defined by Control Panel Services (Windows) or ps –ef (UNIX)) or for an n-tier application, the  account that connects from one service (such as a web server) to another (such as a database server). 

Determine the OS user groups in which each account is a member. 

List the user rights assigned to these users and groups and evaluate whether any of them are unnecessary. If the OS rights exceed application operational requirements, this is a finding. 

If the application user account is a member of the Administrators group (Windows) or has a User Identification  (UID) of 0 (i.e., is equivalent to root in UNIX), this is a finding. 

Search the file system to determine if the application user or groups have ownership or permissions to any files or  directories. 

Review the list of files and identify any that are outside the scope of the application. 

If there are such files outside the scope of the application, this is a finding. 

Check ownership and permissions; identify permissions beyond the minimum necessary to support the application. file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 37 of 253 

If there are instances of unnecessary ownership or permissions, this is a finding. 

The finding details should note the full path of the file(s) and the associated issue (i.e., outside scope, permissions  improperly granted to user X, etc.). 

Fix Text: Modify the application to limit access and prevent the disabling or circumvention of security  safeguards. 

CCI: CCI-002235   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69339   
Group Title: SRG-APP-000342   
Rule ID: SV-83961r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000510   
Rule Title: The application must execute without excessive account permissions. 

Vulnerability Discussion: Applications are often designed to utilize a user account. The account represents a  means to control application permissions and access to OS resources, application resources or both.  

When the application is designed and installed, care must be taken not to assign excessive permissions to the user  account that is used by the application.  

An application operating with unnecessary privileges can potentially give an attacker access to the underlying  operating system or if the privileges required for application execution are at a higher level than the privileges  assigned to organizational users invoking such applications/programs, those users are indirectly provided with  greater privileges than assigned by organizations. 

Applications must be designed and configured to operate with only those permissions that are required for proper  operation. 

Check Content:   
Review the system documentation or interview the application representative and identify if the application  utilizes an account in order to operate. 

Determine the OS user groups in which each application account is a member. List the user rights assigned to  these users and groups using relevant OS commands and evaluate whether any of them provide admin rights or if  they are unnecessary or excessive.  

If the application connects to a database, open an admin console to the database and view the database users, their  roles and group rights. 

Locate the application user account used to access the database and examine the accounts privileges. This includes  group privileges. 

If the application user account has excessive OS privileges such as being in the admin group, database privileges  such as being in the DBA role, has the ability to create, drop, alter the database (not application database tables),  or if the application user account has other excessive or undefined system privileges, this is a finding. 

Fix Text: Configure the application accounts with minimalist privileges. Do not allow the application to operate  with admin credentials. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 38 of 253 

CCI: CCI-002233   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69341   
Group Title: SRG-APP-000343   
Rule ID: SV-83963r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000520   
Rule Title: The application must audit the execution of privileged functions. 

Vulnerability Discussion: Misuse of privileged functions, either intentionally or unintentionally by authorized  users, or by unauthorized external entities that have compromised information system accounts, is a serious and  ongoing concern and can have significant adverse impacts on organizations. Auditing the use of privileged  functions is one way to detect such misuse, and identify the risk from insider threats and the advanced persistent  threat. 

Check Content:   
Log on to the application as an administrative user. 

Identify functionality within the application that requires utilizing the admin role. 

Monitor application logs while performing privileged functions within the application. 

Perform administrative types of tasks such as adding or modifying user accounts, modifying application  configuration, or managing encryption keys. 

Review logs for entries that indicate the administrative actions performed were logged. 

Ensure the specific action taken, date and time or event is recorded. 

If the execution of privileged functionality is not logged, this is a finding. 

Fix Text: Configure the application to write log entries when privileged functions are executed. At a minimum,  ensure the specific action taken, date and time of event are recorded. 

CCI: CCI-002234   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69343   
Group Title: SRG-APP-000065   
Rule ID: SV-83965r1\_rule   
Severity: CAT I   
Rule Version (STIG-ID): APSC-DV-000530   
Rule Title: The application must enforce the limit of three consecutive invalid logon attempts by a user during a  15 minute time period. 

Vulnerability Discussion: By limiting the number of failed logon attempts, the risk of unauthorized system  access via user password guessing, otherwise known as brute forcing, is reduced. 

Limits are imposed by locking the account. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 39 of 253 

User notification when three failed logon attempts are exceeded is an operational consideration determined by the  application owner. In some instances the operational situation may dictate that no notice is to be provided to the  user when their account is locked. In other situations, the user may be notified their account is now locked. This  decision is left to the application owner based upon their operational scenarios. 

Check Content:   
All testing must be performed within a 15-minute window. 

Log on to the application with a test user account. 

Intentionally enter an incorrect user password or pin. 

Repeat 2 times within 15 minutes for a total of three failed attempts. 

Notification of a locked account may or may not be provided. 

Using the correct user password or pin, attempt to logon a 4th time. 

If the logon is successful upon the 4th attempt the account was not locked after the third failed attempt and this is a  finding. 

Fix Text: Configure the application to enforce an account lock after 3 failed logon attempts occurring within a 15- minute window. 

CCI: CCI-000044   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69347   
Group Title: SRG-APP-000345   
Rule ID: SV-83969r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000540   
Rule Title: The application administrator must follow an approved process to unlock locked user accounts. 

Vulnerability Discussion: Once a user account has been locked, it must be unlocked by an administrator. 

An ISSM and ISSO approved process must be created and followed to ensure the user requesting access is  properly authenticated prior to access being re-established. 

The process must include having the user provide information only the user would know and having the  administrator verify the accuracy of the information prior to unlocking the account. This means having the user  provide this information when their account is created so the information can be referenced when they are locked  out.  

The process utilized may be manual in nature, however it is recognized that password resets are a time consuming  task. To minimize helpdesk resource constraints related to user lockout requests, procedures may be automated by  administrators in order to unlock the account or reset the password.  

Authentication process examples include having the user provide personal information known only by the user  and provided when the account was created and/or using Out-of-Band or side channel communication methods  such as text messages to the users established cell phone number in order to provide a temporary password or  token that can be used to logon once and reset the password. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 40 of 253 

The OWASP site provides an acceptable password reset process that can be used as a reference.  https://www.owasp.org/index.php/Forgot\_Password\_Cheat\_Sheet.  

Automated procedures should follow industry standards and best practice for securely automating password  reset/account unlocks and must be reviewed, tested, and then approved by the ISSM and ISSO. 

Check Content:   
Interview the application administrator and identify the approved process for unlocking user accounts. 

The process may involve a manual or automated reset after the locked out user has identified themselves using  standard user identification processes outlined in the vulnerability discussion. 

If the admin does not unlock the account following the approved process, and if the process does not have  documented ISSO and ISSM approvals, this is a finding. 

Fix Text: Create a standard approved process for unlocking locked application accounts which includes validating  user identity prior to unlocking the account. 

Use that process when unlocking application user accounts. 

CCI: CCI-002238   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69349   
Group Title: SRG-APP-000068   
Rule ID: SV-83971r2\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000550   
Rule Title: The application must display the Standard Mandatory DoD Notice and Consent Banner before  granting access to the application. 

Vulnerability Discussion: Display of the DoD-approved use notification before granting access to the application  ensures privacy and security notification verbiage used is consistent with applicable federal laws, Executive  Orders, directives, policies, regulations, standards, and guidance. 

System use notifications are required only for access via logon interfaces with human users and are not required  when such human interfaces do not exist. 

The banner must be formatted in accordance with DTM-08-060. Use the following verbiage for applications that  can accommodate banners of 1300 characters: 

"You are accessing a U.S. Government (USG) Information System (IS) that is provided for USG-authorized use  only. 

By using this IS (which includes any device attached to this IS), you consent to the following conditions: 

\-The USG routinely intercepts and monitors communications on this IS for purposes including, but not limited to,  penetration testing, COMSEC monitoring, network operations and defense, personnel misconduct (PM), law  enforcement (LE), and counterintelligence (CI) investigations. 

\-At any time, the USG may inspect and seize data stored on this IS. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 41 of 253 

\-Communications using, or data stored on, this IS are not private, are subject to routine monitoring, interception,  and search, and may be disclosed or used for any USG-authorized purpose. 

\-This IS includes security measures (e.g., authentication and access controls) to protect USG interests--not for  your personal benefit or privacy. 

\-Notwithstanding the above, using this IS does not constitute consent to PM, LE or CI investigative searching or  monitoring of the content of privileged communications, or work product, related to personal representation or  services by attorneys, psychotherapists, or clergy, and their assistants. Such communications and work product are  private and confidential. See User Agreement for details." 

Use the following verbiage for operating systems that have severe limitations on the number of characters that can  be displayed in the banner: 

"I've read & consent to terms in IS user agreem't." 

Check Content:   
If the application has no interactive user interface, this requirement is not applicable. 

Log on to the application as a user. 

Observe the screen and ensure the DoD-approved banner is displayed prior to obtaining access to the application.  Refer to the vulnerability discussion for the approved text. 

If the only way to access the application is through the OS console, e.g., a fat client application installed on a GFE  desktop or laptop, and that GFE is configured to display the DoD banner, an additional banner is not required at  the application level. 

If the standard DoD-approved banner is not displayed prior to obtaining access, this is a finding. 

Fix Text: Configure the application to present the standard DoD-approved banner prior to granting access to the  application. 

CCI: CCI-000048   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69351   
Group Title: SRG-APP-000069   
Rule ID: SV-83973r2\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000560   
Rule Title: The application must retain the Standard Mandatory DoD Notice and Consent Banner on the screen  until users acknowledge the usage conditions and take explicit actions to log on for further access. 

Vulnerability Discussion: The banner must be acknowledged by the user prior to allowing the user access to the  application. This provides assurance that the user has seen the message and accepted the conditions for access. If  the consent banner is not acknowledged by the user, DoD will not be in compliance with system use notifications  required by law. 

To establish acceptance of the application usage policy, a click-through banner at application logon is required.  The application must prevent further activity until the user executes a positive action to manifest agreement by  clicking on a box indicating "OK". 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 42 of 253 

Check Content:   
If the application has no interactive user interface, this requirement is not applicable. 

If the user interface is only available via the OS console, e.g., a fat client application installed on a GFE desktop or  laptop, and that GFE is configured to display the DoD banner, this requirement is not applicable. 

Access the application and authenticate if necessary. Verify the banner is displayed and action must be taken to  accept terms of use. 

If the banner is not displayed or no action must be taken to accept terms of use, this is a finding. 

Fix Text: Configure the application to retain the standard DoD-approved banner until the user accepts the usage  conditions prior to granting access to the application. 

CCI: CCI-000050   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69353   
Group Title: SRG-APP-000070   
Rule ID: SV-83975r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000570   
Rule Title: The publicly accessible application must display the Standard Mandatory DoD Notice and Consent  Banner before granting access to the application. 

Vulnerability Discussion: Display of a standardized and approved use notification before granting access to the  publicly accessible application ensures privacy and security notification verbiage used is consistent with  applicable federal laws, Executive Orders, directives, policies, regulations, standards, and guidance. 

System use notifications are required only for access via logon interfaces with human users and are not required  when such human interfaces do not exist. 

The banner must be formatted in accordance with DTM-08-060. Use the following verbiage for desktops, laptops,  and other devices accommodating banners of 1300 characters: 

"You are accessing a U.S. Government (USG) Information System (IS) that is provided for USG-authorized use  only. 

By using this IS (which includes any device attached to this IS), you consent to the following conditions: 

\-The USG routinely intercepts and monitors communications on this IS for purposes including, but not limited to,  penetration testing, COMSEC monitoring, network operations and defense, personnel misconduct (PM), law  enforcement (LE), and counterintelligence (CI) investigations. 

\-At any time, the USG may inspect and seize data stored on this IS. 

\-Communications using, or data stored on, this IS are not private, are subject to routine monitoring, interception,  and search, and may be disclosed or used for any USG-authorized purpose. 

\-This IS includes security measures (e.g., authentication and access controls) to protect USG interests--not for  your personal benefit or privacy. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 43 of 253 

\-Notwithstanding the above, using this IS does not constitute consent to PM, LE or CI investigative searching or  monitoring of the content of privileged communications, or work product, related to personal representation or  services by attorneys, psychotherapists, or clergy, and their assistants. Such communications and work product are  private and confidential. See User Agreement for details." 

Use the following verbiage for operating systems that have severe limitations on the number of characters that can  be displayed in the banner: 

"I've read & consent to terms in IS user agreem't." 

Check Content:   
This requirement only applies to publicly accessible applications. If the application is not publicly accessible, this  requirement is not applicable. 

Access the application and observe the screen to ensure the DoD-approved banner is displayed prior to obtaining  full access to the application. Refer to the vulnerability discussion for the approved banner text. 

If the standard DoD-approved banner is not displayed prior to obtaining access, this is a finding. 

Fix Text: Configure the application to present the standard DoD-approved banner prior to granting access to the  application. 

CCI: CCI-001384 

CCI: CCI-001385 

CCI: CCI-001386 

CCI: CCI-001387 

CCI: CCI-001388   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69355   
Group Title: APSC-DV-000580   
Rule ID: SV-83977r1\_rule   
Severity: CAT III   
Rule Version (STIG-ID): APSC-DV-000580   
Rule Title: The application must display the time and date of the users last successful logon. 

Vulnerability Discussion: Providing a last successful logon date and time stamp notification to the user when  they authenticate and access the application allows the user to determine if their application account has been used  without their knowledge.  

Armed with that information, the user can notify the application administrator and initiate a forensics investigation  to identify root cause. Without providing this information to the user, a potential compromise of user accounts  could go unnoticed. 

Check Content:   
Review the application documentation and interview the application administrator. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 44 of 253 

If the application does not provide a user interface, this requirement is not applicable. 

Logon to the application as a test user and verify successful authentication by creating test data, navigating the  application functionality or otherwise utilizing the application. 

Note the date and time access was granted. 

Log out of the application. 

Re-authenticate to the application as the same user. 

Validate the last logon date and time is displayed in the user interface.  

If the date and time the user account was last granted access to the application is not displayed in the user  interface, this is a finding. 

Fix Text: Design and configure the application to display the date and time when the user was last successfully  granted access to the application. 

CCI: CCI-000052   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69357   
Group Title: SRG-APP-000080   
Rule ID: SV-83979r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000590   
Rule Title: The application must protect against an individual (or process acting on behalf of an individual)  falsely denying having performed organization-defined actions to be covered by non-repudiation. 

Vulnerability Discussion: Without non-repudiation, it is impossible to positively attribute an action to an  individual (or process acting on behalf of an individual). 

Non-repudiation services can be used to determine if information originated from a particular individual, or if an  individual took specific actions (e.g., sending an email, signing a contract, approving a procurement request) or  received specific information. Non-repudiation protects individuals against later claims by an author of not having  authored a particular document, a sender of not having transmitted a message, a receiver of not having received a  message, or a signatory of not having signed a document. The application will be configured to provide non repudiation services for an organization-defined set of commands that are used by the user (or processes action on  behalf of the user). 

DoD PKI provides for non-repudiation through the use of digital signatures. Non-repudiation requirements will  vary from one application to another and will be defined based on application functionality, data sensitivity, and  mission requirements. 

Check Content:   
Review the application documentation, the design requirements if available and interview the application  administrator. 

Identify application services or application commands that are formerly required and designed to provide non repudiation services (e.g., digital signatures).  

If the application documentation specifically states that non-repudiation services for application users are not  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 45 of 253 

defined as part of the application design, this requirement is not applicable.  

Email is one example of an application specifically required to provide non-repudiation services for application  users within the DoD.  

Interview the application administrators and have them describe which aspect of the application, if any, is required  to provide digital signatures. 

Access the application as a test user or observe the application administrator as they demonstrate the applications  signature capabilities. 

If the application is required to provide non-repudiation services and does not, or if the non-repudiation  functionality fails on demonstration, this is a finding. 

Fix Text: Configure the application to provide users with a non-repudiation function in the form of digital  signatures when it is required by the organization or by the application design and architecture. 

CCI: CCI-000166   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69359   
Group Title: SRG-APP-000086   
Rule ID: SV-83981r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000600   
Rule Title: For applications providing audit record aggregation, the application must compile audit records from  organization-defined information system components into a system-wide audit trail that is time-correlated with an  organization-defined level of tolerance for the relationship between time stamps of individual records in the audit  trail. 

Vulnerability Discussion: Without the ability to collate records based on the time when the events occurred, the  ability to perform forensic analysis and investigations across multiple components is significantly degraded. 

Audit trails are time-correlated if the time stamps in the individual audit records can be reliably related to the time  stamps in other audit records to achieve a time ordering of the records within organization-defined level of  tolerance. 

This requirement applies to applications which provide the capability to compile system-wide audit records for  multiple systems or system components. However, all applications must provide the relevant log details that are  used to aggregate the information. 

Check Content:   
Review the application documentation and interview the application administrator. 

Determine if the application has the ability to compile audit records from multiple systems or system components. If the application does not provide log aggregation services, this requirement is not applicable. 

Identify the systems that comprise the application. 

Access each system comprising the application or a random sample of several application systems. Review the  application logs and obtain date and time stamps for several random audit events. Record the information. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 46 of 253 

Access the server providing the log aggregation. Access the application logs that have been written to the server  and compare the samples obtained from the application systems to the aggregated logs. Ensure the dates and time  stamps correlate with one another. 

If the log dates and times do not correlate when the logs are aggregated, this is a finding. 

Fix Text: Configure the application to correlate time stamps when aggregating audit records. 

CCI: CCI-000174   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69361   
Group Title: SRG-APP-000353   
Rule ID: SV-83983r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000610   
Rule Title: The application must provide the capability for organization-identified individuals or roles to change  the auditing to be performed on all application components, based on all selectable event criteria within  organization-defined time thresholds. 

Vulnerability Discussion: If authorized individuals do not have the ability to modify auditing parameters in  response to a changing threat environment, the organization may not be able to effectively respond, and important  forensic information may be lost. 

This requirement enables organizations to extend or limit auditing as necessary to meet organizational  requirements. Auditing that is limited to conserve information system resources may be extended to address  certain threat situations. In addition, auditing may be limited to a specific set of events to facilitate audit reduction,  analysis, and reporting. Organizations can establish time thresholds in which audit actions are changed, for  example, near real-time, within minutes, or within hours. 

Check Content:   
Review the application documentation and interview the application administrator to identify the auditing  configuration capabilities of the application. 

Access the audit management settings of the application as an authorized user and evaluate the verbosity  capabilities of the log settings. 

Determine if the settings are available to readily increase or decrease logging verbosity on demand for identified  roles or individuals. 

Review log files and identify what information is retained in the logs. 

Increase logging verbosity to include additional application components or details in the logs. For example, if  standard log settings do not include connection resets or process errors, add those settings to the log configuration  and re-examine the logs to ensure the number of data points being logged has increased and includes those values. 

Next decrease logging verbosity to the minimum data and re-examine the logs to ensure the log verbosity has  changed. 

If the application does not have the ability for specific roles or individuals to change the auditing verbosity  performed on all application components, this is a finding. 

Fix Text: Design the application to provide the capability for individuals or roles to change the auditing to be  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 47 of 253 

performed on all application components. 

CCI: CCI-001914   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69363   
Group Title: SRG-APP-000089   
Rule ID: SV-83985r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000620   
Rule Title: The application must provide audit record generation capability for the creation of session IDs. 

Vulnerability Discussion: Applications create session IDs at the onset of a user session in order to manage user  access to the application and differentiate between different user sessions. It is important to log the creation of  these session ID creation events for forensic purposes. 

It is equally important to not log the session ID itself. Logging the session ID puts active sessions at risk if log  data is compromised. Specific session ID information should be removed, masked, sanitized, or encrypted. 

A hash value of the session ID that can be mapped to the session ID is an acceptable method for assuring active  session protection when logging session ID information. Alternatively, logging protections that protect the logs  and defend from unauthorized access are means to assure log confidentiality and protect session integrity. 

Web based applications will often utilize an application server that creates, manages and logs user session IDs. It  is acceptable for the application to delegate this requirement to the application server. 

Check Content:   
Access the management interface for the application or configuration file and evaluate the log/audit management  settings. 

Determine if the setting that enables session ID creation event auditing is activated. 

Create a new user session by logging in to the application. 

Review the logs to ensure the session creation event was recorded. 

If the application is not configured to log session ID creation events, or if no creation event was recorded, this is a  finding. 

If a web-based application delegates session ID creation to an application server, this is not a finding.  

If the application generates session ID creation event logs by default, and that behavior cannot be disabled, this is  not a finding. 

Fix Text: Enable session ID creation event auditing. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69365   
Group Title: SRG-APP-000089 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 48 of 253 

Rule ID: SV-83987r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000630   
Rule Title: The application must provide audit record generation capability for the destruction of session IDs. 

Vulnerability Discussion: Applications should destroy session IDs at the end of a user session in order to  terminate user access to the application session and to reduce the possibility of an unauthorized attacker high  jacking the session and impersonating the user. It is important to log when session IDs are destroyed for forensic  purposes. 

Web based applications will often utilize an application server that creates, manages and logs session IDs. It is  acceptable for the application to delegate this requirement to the application server. 

Check Content:   
Access the management interface for the application or configuration file and evaluate the log/audit management  settings. 

Determine if the setting that enables session ID destruction event auditing is activated. 

Terminate a user session within the application and review the logs to ensure the session destruction event was  recorded. 

If the application is not configured to log session ID destruction events, or if the application has no means to  enable auditing of session ID destruction events, this is a finding. 

If a web-based application delegates session ID destruction to an application server, this is not a finding.  

If the application generates audit logs by default when session IDs are destroyed, and that behavior cannot be  disabled, this is not a finding. 

Fix Text: Enable session ID destruction event auditing. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69367   
Group Title: SRG-APP-000089   
Rule ID: SV-83989r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000640   
Rule Title: The application must provide audit record generation capability for the renewal of session IDs. 

Vulnerability Discussion: Application design sometimes requires the renewal of session IDs in order to continue  approved user access to the application. 

Session renewal is done on a case by case basis under circumstances defined by the application architecture. The  following are some examples of when session renewal must be done; whenever there is a change in user privilege  such as transitioning from a user to an admin role or when a user changes from an anonymous user to an  authenticated user or when a user's permissions have changed. 

For these types of critical application functionalities, the previous session ID needs to be destroyed or otherwise  invalidated and a new session ID must be created. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 49 of 253 

It is important to log when session IDs are renewed for forensic purposes. 

Web based applications will often utilize an application server that creates, manages and logs session IDs. It is  acceptable for the application to delegate this requirement to the application server. 

Check Content:   
Interview the system admin and review the application documentation. 

Identify any web pages or application functionality where a user's privileges or permissions will change. This is  most likely to occur during the authentication stages. 

Evaluate the log/audit output by opening the log files and observing changes to the logs. 

Create a new user session by accessing the application. 

Review the logs and save the relevant session creation event recorded. 

Utilize the application pages that provide privilege escalation. 

Escalate privileges by authenticating as a privileged user. 

Review the logs and determine if new session information is created and being used. 

If a web-based application delegates session ID renewals to an application server, this is not a finding.  

If the application is not configured to log session ID renewal events this is a finding. 

Fix Text: Design or reconfigure the application to log session renewal events on those application events that  provide changes in the users privileges or permissions to the application. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69369   
Group Title: SRG-APP-000089   
Rule ID: SV-83991r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000650   
Rule Title: The application must not write sensitive data into the application logs. 

Vulnerability Discussion: It is important to identify and exclude certain types of data that is written into the logs.  If the logs are compromised and sensitive data is included in the logs, this could assist an attacker in furthering  their attack or it could completely compromise the system. 

Examples of such data include but are not limited to; Passwords, Session IDs, Application source code, encryption  keys, and sensitive data such as personal health information (PHI), Personally Identifiable Information (PII), or  government identifiers (e.g., SSN). 

Check Content:   
Review the application logs and identify application logging format. Using the format of the log and the requisite  search data as a guide to create your search, create search strings that could successfully identify the existence of  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 50 of 253 

passwords, session IDs, or other sensitive information such as SSN. 

Utilizing the UNIX grep-based search utility include the following examples which are meant to illustrate the  purpose of the requirement. 

Password values are usually associated with usernames so searching for "username" in the provided log file will  often assist in determining if password values are included. 

grep -i "username" \< logfile.txt 

Search for social security numbers in the provided log file. 

grep -i "\[0-9\]{3}\[-\]?\[0-9\]{2}\[-\]?\[0-9\]{4}" \< logfile.txt 

Use regular expressions to aid in searching log files. All search syntax cannot be provided within the STIG, the  reviewer must utilize their knowledge to create new search criteria based upon the log format used and the  potentially sensitive data processed by the application. 

If the application logs sensitive data such as session IDs, application source code, encryption keys, or passwords,  this is a finding. 

Fix Text: Design or reconfigure the application to not write sensitive data to the logs. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69371   
Group Title: SRG-APP-000089   
Rule ID: SV-83993r2\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000660   
Rule Title: The application must provide audit record generation capability for session timeouts. 

Vulnerability Discussion: When a user's session times out, it is important to be able to identify these events in  the application logs. 

Without the capability to generate audit records, it would be difficult to establish, correlate, and investigate the  events relating to an incident, or identify those responsible for one. 

Audit records can be generated from various components within the application (e.g., process, module). Certain  specific application functionalities may be audited as well. The list of audited events is the set of events for which  audits are to be generated. This set of events is typically a subset of the list of all events for which the system is  capable of generating audit records. 

DoD has defined the list of events for which the application will provide an audit record generation capability as  the following: 

(i) Successful and unsuccessful attempts to access, modify, or delete privileges, security objects, security levels, or  categories of information (e.g., classification levels); 

(ii) Access actions, such as successful and unsuccessful logon attempts, privileged activities or other system level  access, starting and ending time for user access to the system, concurrent logons from different workstations,  successful and unsuccessful accesses to objects, all program initiations, and all direct access to the information  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 51 of 253 

system; and 

(iii) All account creation, modification, disabling, and termination actions. 

Web-based applications will often utilize an application server that creates, manages, and logs session timeout  information. It is acceptable for the application to delegate this requirement to the application server. 

Check Content:   
Review the application documentation and interview the application administrator to identify log locations for  application session activity. 

Open the log file that tracks user session activity. 

Access the application as a regular user and identify the user session within the log files. 

Identify the session timeout threshold defined by the application. 

Perform no action within the application in order to allow the session to timeout. 

Once the session timeout threshold has been exceeded, verify the session has been terminated due to the timeout  event and review the logs again to ensure the session timeout event was recorded in the logs. 

If a web-based application delegates session timeout auditing to an application server, this is not a finding.  

If the session timeout event is not recorded in the logs, this is a finding. 

Fix Text: Configure the application to record session timeout events in the logs. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69373   
Group Title: SRG-APP-000089   
Rule ID: SV-83995r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000670   
Rule Title: The application must record a time stamp indicating when the event occurred. 

Vulnerability Discussion: It is important to include the time stamps for when an event occurred. Failure to  include time stamps in the event logs is detrimental to forensic analysis. 

Check Content:   
Review the application logs. 

If the time the event occurred is not included as part of the event, this is a finding. 

Fix Text: Configure the application to record the time the event occurred when recording the event. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 52 of 253 

Group ID (Vulid): V-69375   
Group Title: SRG-APP-000089   
Rule ID: SV-83997r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000680   
Rule Title: The application must provide audit record generation capability for HTTP headers including User Agent, Referer, GET, and POST. 

Vulnerability Discussion: HTTP header information is a critical component of data that is used when evaluating  forensic activity. 

Without the capability to generate audit records, it would be difficult to establish, correlate, and investigate the  events relating to an incident, or identify those responsible for one. 

Audit records can be generated from various components within the application (e.g., process, module). Certain  specific application functionalities may be audited as well. The list of audited events is the set of events for which  audits are to be generated. This set of events is typically a subset of the list of all events for which the system is  capable of generating audit records. 

DoD has defined the list of events for which the application will provide an audit record generation capability as  the following: 

(i) Successful and unsuccessful attempts to access, modify, or delete privileges, security objects, security levels, or  categories of information (e.g., classification levels); 

(ii) Access actions, such as successful and unsuccessful logon attempts, privileged activities or other system level  access, starting and ending time for user access to the system, concurrent logons from different workstations,  successful and unsuccessful accesses to objects, all program initiations, and all direct access to the information  system; and 

(iii) All account creation, modification, disabling, and termination actions. 

Check Content:   
Review the application documentation and interview the application administrator to identify log locations for  application session activity. 

Open the log file that tracks user session activity. 

Access the application as a regular user and identify the user session within the log files. Perform several actions within the application in order to generate HTTP header traffic. 

Review the logs to ensure the HTTP header information is recorded in the logs. Header information logged will  vary based upon the application and environment. Examples of headers include but are not limited to: 

User-Agent:   
Referer:   
X-Forwarded-For:   
Date:   
Expires: 

If HTTP headers are not logged, this is a finding. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 53 of 253 

Fix Text: Configure the web application and/or the web server to log HTTP headers. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69377   
Group Title: SRG-APP-000089   
Rule ID: SV-83999r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000690   
Rule Title: The application must provide audit record generation capability for connecting system IP addresses. 

Vulnerability Discussion: Without the capability to generate audit records, it would be difficult to establish,  correlate, and investigate the events relating to an incident, or identify those responsible for one. 

Audit records can be generated from various components within the application (e.g., process, module). Certain  specific application functionalities may be audited as well. The list of audited events is the set of events for which  audits are to be generated. This set of events is typically a subset of the list of all events for which the system is  capable of generating audit records. 

The IP addresses of remote systems that connect to the application are an important aspect of identifying the  sources of application activity. Recording these IP addresses in the application logs provides forensic evidence and  aids in investigating and identifying sources of malicious behavior related to security events. 

Check Content:   
Review the application documentation and interview the application administrator to identify where audit logs are  stored. 

Review audit logs and determine if the IP address information of systems that connect to the application is kept in  the logs. 

If connecting IP addresses are not seen in the logs, connect to the application remotely and review the logs to  determine if the connection was logged. 

If the IP addresses of the systems that connect to the application are not recorded in the logs, this is a finding. Fix Text: Configure the application or application server to log all connecting IP address information 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69379   
Group Title: SRG-APP-000089   
Rule ID: SV-84001r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000700   
Rule Title: The application must record the username or user ID of the user associated with the event. 

Vulnerability Discussion: When users conduct activity within an application, that user’s identity must be  recorded in the audit log. Failing to record the identity of the user responsible for the activity within the  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 54 of 253 

application is detrimental to forensic analysis. 

Check Content:   
Review and monitor the application logs. 

Connect to the application and perform application activity that is allowed by the user such as accessing data or  running reports. 

Observe if the log includes an entry to indicate the user ID of the user that conducted the activity. 

If the user ID is not recorded along with the event in the event log, this is a finding. 

Fix Text: Configure the application to record the user ID of the user responsible for the log event entry. 

CCI: CCI-000169   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69381   
Group Title: SRG-APP-000091   
Rule ID: SV-84003r2\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000710   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to grant privileges  occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

When a user is granted access or rights to application features and function not afforded to an ordinary user, they  have been granted access to privilege and that action must be logged. 

Check Content:   
Review the application documentation and interview the application admin to identify application management  interfaces and features. 

Access the application management utility and create a test user account or use the account of a regular  unprivileged user who is cooperating with the testing. 

Access and open the auditing logs. 

Using an account with the appropriate privileges, grant the user a privilege they previously did not have. 

Attempt to grant privileges in a manner that will cause a failure event such as granting privileges to a non-existent  user or attempting to grant privileges with an account that doesn't have the rights to do so. 

Review the application logs and ensure both events were captured in the logs. The event data should include the  user’s identity and the privilege that was granted and the privilege that failed to be granted. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 55 of 253 

If the application does not log when successful and unsuccessful attempts to grant privilege occur, this is a finding. Fix Text: Configure the application to audit successful and unsuccessful attempts to grant privileges. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69383   
Group Title: SRG-APP-000492   
Rule ID: SV-84005r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000720   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to access security  objects occur. 

Vulnerability Discussion: Security objects represent application objects that provide or require security  protections or have a security role within the application. Examples include but are not limited to, files, application  modules, folders, and database records. Essentially, if permissions are assigned to protect it, it can be considered a  security object. Without generating audit records that are specific to the security and mission needs of the  organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify application functionality that provides privilege or permission settings to security objects within the  application. 

This can be an application function that assigns privileges to an application object or data element. 

Authenticate to the application as a regular user. Using application functionality, attempt to access the security  object within the application. 

Perform two attempts, one successfully and one unsuccessfully. 

Review the log data and ensure both the successful and unsuccessful access attempts are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to access security  objects occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  access security objects. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_Group ID (Vulid): V-69385 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 56 of 253 

Group Title: SRG-APP-000493   
Rule ID: SV-84007r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000730   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to access security  levels occur. 

Vulnerability Discussion: A security level denotes a permissions or authorization capability within the  application. This is most often associated with a user role. Attempts to access a security level can occur when a  user attempts an action such as escalating their privilege from within the application itself. Attempts to access a  security level can be construed as an attempt to change your user role from within the application.  

Without generating audit records that are specific to the security and mission needs of the organization, it would  be difficult to establish, correlate, and investigate the events relating to an incident, or identify those responsible  for one. Audit records can be generated from various components within the information system (e.g., module or  policy filter). 

Check Content:   
Review the application documentation and interview the application administrator. Identify where the application  logs are stored. 

Identify application functionality that provides privilege escalation or access to additional security levels within  the application. 

This can be performing a function that escalates the privileges of the user, or accessing a protected area of the  application that requires additional authentication in order to access. 

Authenticate to the application as a regular user. Using application functionality, attempt to access a different  security level or domain within the application. 

Perform two attempts, one successfully and one unsuccessfully. 

Review the log data and ensure both the successful and unsuccessful access attempts are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to access security  levels occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  access security levels. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69387   
Group Title: SRG-APP-000494   
Rule ID: SV-84009r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000740   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to access  categories of information (e.g., classification levels) occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 57 of 253 

the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Categories of information is information that is identified as being sensitive or requiring additional protection  from regular user access. The data is accessed on a need to know basis and has been assigned a category or a  classification in order to assign protections and track access. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. Identify where the application  logs are stored. 

Identify any data protections that are required. 

Identify any categories of data or classification of data. 

If the application requirements do not call for compartmentalized data and data protection, this requirement is not  applicable. 

Authenticate to the application as a regular user. Using application functionality, attempt to access data that has  been assigned to a protected category. 

Perform two access attempts, one successful and one unsuccessful. 

Testing this will require obtaining access to test data that has been assigned to a protected category, or having an  authorized user access the data for you. 

Review the log data and ensure both the successful and unsuccessful access attempts are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to access categories  of information occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  access protected categories of information. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69389   
Group Title: SRG-APP-000495   
Rule ID: SV-84011r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000750   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to modify  privileges occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 58 of 253 

filter). 

Check Content:   
Review the application documentation and interview the application admin to identify application management  interfaces and features. 

Access the application management utility and create a test user account or use the account of a regular privileged  user who is cooperating with the testing. 

Access and open the auditing logs. 

Using an admin account, modify the privileges of a privileged user. 

Attempt to modify privileges in a manner that will cause a failure event such as attempting to modify a user’s  privileges with an account that doesn't have the rights to do so. 

Review the application logs and ensure both events were captured in the logs. The event data should include the  user’s identity and the privilege that was granted and the privilege that failed to be granted. 

If the application does not log when successful and unsuccessful attempts to modify privileges occur, this is a  finding. 

Fix Text: Configure the application to audit successful and unsuccessful attempts to modify privileges. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69391   
Group Title: SRG-APP-000496   
Rule ID: SV-84013r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000760   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to modify security  objects occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify application functionality that provides privilege or permission settings to security objects within the  application. 

This can be an application function that assigns privileges to an application object or data element. Authenticate to the application as a regular user. Using application functionality, attempt to modify the security  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 59 of 253 

object within the application. 

Perform two attempts, one successfully and one unsuccessfully. 

Review the log data and ensure the modification events both successful and unsuccessful are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to modify security  objects occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  modify security objects. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69393   
Group Title: SRG-APP-000497   
Rule ID: SV-84015r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000770   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to modify security  levels occur. 

Vulnerability Discussion: A security level denotes a permissions or authorization capability within the  application. This is most often associated with a user role. Attempts to modify a security level can be construed as  an attempt to change the configuration of the application so as to create a new security role or modify an existing  security role. Some applications may or may not provide this capability. 

Without generating audit records that are specific to the security and mission needs of the organization, it would  be difficult to establish, correlate, and investigate the events relating to an incident, or identify those responsible  for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify application functionality that provides privilege escalation or access to additional security levels within  the application. 

This can be performing a function that escalates the privileges of the user, or accessing a protected area of the  application that requires additional authentication in order to access. 

Authenticate to the application as a regular user. Using application functionality, attempt to modify the  permissions of a different security level or domain within the application. 

Perform two attempts, one successfully and one unsuccessfully. 

Review the log data and ensure the modify events, both successful and unsuccessful, are logged. file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 60 of 253 

If the application does not generate an audit record when successful and unsuccessful attempts to modify the  permissions regarding the security levels occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  modify security levels. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69395   
Group Title: SRG-APP-000498   
Rule ID: SV-84017r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000780   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to modify  categories of information (e.g., classification levels) occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify any data protections that are required. 

Identify any categories of data or classification of data. 

If the application requirements do not call for compartmentalized data and data protection, this requirement is not  applicable. 

Authenticate to the application as a regular user. Using application functionality, attempt to modify data that has  been assigned to a protected category. 

Perform two modification attempts, one successful and one unsuccessful. 

Testing this will require obtaining access to test data that has been assigned to a protected category, or having an  authorized user access the data for you. 

Review the log data and ensure both the successful and unsuccessful modification attempts are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to modify  categories of information occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  modify protected categories of information. 

CCI: CCI-000172 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 61 of 253 

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69397   
Group Title: SRG-APP-000499   
Rule ID: SV-84019r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000790   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to delete  privileges occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application admin to identify application management  interfaces and features. 

Access the application management utility and create a test user account or use the account of a regular privileged  user who is cooperating with the testing. 

Access and open the auditing logs. 

Using an admin account, delete some or all of the privileges of a privileged user. 

Attempt to delete privileges in a manner that will cause a failure event such as attempting to delete a user’s  privileges with an account that doesn't have the rights to do so. 

Review the application logs and ensure both events were captured in the logs. The event data should include the  user’s identity and the privilege that was granted and the privilege that failed to be granted. 

If the application does not log when successful and unsuccessful attempts to delete privileges occur, this is a  finding. 

Fix Text: Configure the application to audit successful and unsuccessful attempts to delete privileges. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69399   
Group Title: SRG-APP-000500   
Rule ID: SV-84021r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000800   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to delete security  levels occur. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 62 of 253 

Vulnerability Discussion: A security level denotes a permissions or authorization capability within the  application. This is most often associated with a user role. Attempts to delete a security level can be construed as  an attempt to change the configuration of the application so as to delete an existing security role. Some  applications may or may not provide this capability. 

Without generating audit records that are specific to the security and mission needs of the organization, it would  be difficult to establish, correlate, and investigate the events relating to an incident, or identify those responsible  for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify application functionality that provides privilege escalation or access to additional security levels within  the application. 

This can be performing a function that escalates the privileges of the user, or accessing a protected area of the  application that requires additional authentication in order to access. 

Authenticate to the application as a regular user. Using application functionality, attempt to delete permissions of a  different security level or domain within the application. 

Perform two attempts, one successfully and one unsuccessfully. 

Review the log data and ensure the deletion events, both successful and unsuccessful are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to delete  permissions regarding the security levels occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  delete security levels. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69401   
Group Title: SRG-APP-000501   
Rule ID: SV-84023r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000810   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to delete  application database security objects occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 63 of 253 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify application functionality that provides privilege or permission settings to database security objects within  the application. This can be an application function that assigns privileges to an application object or data element. 

Authenticate to the application as a regular user. Using application functionality, attempt to delete the database  security object within the application. 

Perform two attempts, one successfully and one unsuccessfully. 

Review the log data and ensure the deletion events, both successful and unsuccessful, are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to delete database  security objects occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  delete database security objects. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69403   
Group Title: SRG-APP-000502   
Rule ID: SV-84025r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000820   
Rule Title: The application must generate audit records when successful/unsuccessful attempts to delete  categories of information (e.g., classification levels) occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify where the application logs are stored. 

Identify any data protections that are required. 

Identify any categories of data or classification of data. 

If the application requirements do not call for compartmentalized data and data protection, this requirement is not  applicable. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 64 of 253 

Authenticate to the application as a regular user. Using application functionality, attempt to delete data that has  been assigned to a protected category. 

Perform two modification attempts, one successful and one unsuccessful. 

Testing this will require obtaining access to test data that has been assigned to a protected category, or having an  authorized user access the data for you. 

Review the log data and ensure both the successful and unsuccessful deletion attempts are logged. 

If the application does not generate an audit record when successful and unsuccessful attempts to delete categories  of information occur, this is a finding. 

Fix Text: Configure the application to create an audit record for both successful and unsuccessful attempts to  delete protected categories of information. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69405   
Group Title: SRG-APP-000503   
Rule ID: SV-84027r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000830   
Rule Title: The application must generate audit records when successful/unsuccessful logon attempts occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Knowing when a user successfully or unsuccessfully logged on to the application is critical information that aids  in forensic analysis. 

Check Content:   
Review and monitor the application logs. 

Authenticate to the application and observe if the log includes an entry to indicate the user’s authentication was  successful. 

Terminate the user session by logging out. 

Reauthenticate using invalid user credentials and observe if the log includes an entry to indicate the authentication  was unsuccessful. 

If successful and unsuccessful logon events are not recorded in the logs, this is a finding. 

Fix Text: Configure the application or application server to write a log entry when successful and unsuccessful  logon events occur. 

CCI: CCI-000172 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 65 of 253 

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69407   
Group Title: SRG-APP-000504   
Rule ID: SV-84029r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000840   
Rule Title: The application must generate audit records for privileged activities or other system-level access. 

Vulnerability Discussion: Privileged activities include the tasks or actions taken by users in an administrative  role (admin, backup operator, manager, etc.) which are used to manage or reconfigure application function.  Examples include but are not limited to: 

Modifying application logging verbosity, starting or stopping of application services, application user account  management, managing application functionality, or otherwise changing the underlying application capabilities  such as adding a new application module or plugin. 

Privileged access does not include an application design which does not modify the application but does provide  users with the functionality or the ability to manage their own user specific preferences or otherwise tailor the  application to suit individual user needs based upon choices or selections built into the application. 

Check Content:   
Review and monitor the application logs. 

Authenticate to the application as a privileged user and observe if the log includes an entry to indicate the user’s  authentication was successful. 

Perform actions as an admin or other privileged user such as modifying the logging verbosity, or starting or  stopping an application service, or terminating a test user session. 

If log events that correspond with the actions performed are not recorded in the logs, this is a finding. 

Fix Text: Configure the application to write a log entry when privileged activities or other system-level events  occur. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69409   
Group Title: SRG-APP-000505   
Rule ID: SV-84031r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000850   
Rule Title: The application must generate audit records showing starting and ending time for user access to the  system. 

Vulnerability Discussion: Knowing when a user’s application session began and when it ended is critical  information that aids in forensic analysis. 

Check Content: 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 66 of 253 

Review and monitor the application logs. 

Initiate a user session and observe if the log includes a time stamp showing the start of the session. Terminate the user session and observe if the log includes a time stamp showing the end of the session. 

If the start and the end time of the session are not recorded in the logs, this is a finding. 

Fix Text: Configure the application or application server to record the start and end time of user session activity. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69411   
Group Title: SRG-APP-000507   
Rule ID: SV-84033r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000860   
Rule Title: The application must generate audit records when successful/unsuccessful accesses to objects occur. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Application objects are system or application components that comprise the application. This includes but is not  limited to; application files, folders, processes and modules. 

This requirement is not intended to force the use of debug logging which would be used for troubleshooting or  forensic actions; rather it is intended to assure the application strikes a balance when auditing access to application  objects and logs normal and potentially abnormal application activity. 

Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator to identify log locations. Access the application logs. 

Review the logs and identify if the application is logging both successful and unsuccessful access to application  objects such as files, folders, processes, or application modules and sub components, or systems. 

If the application does not log application object access, this is a finding. 

Fix Text: Configure the application to log successful and unsuccessful access to application objects. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69413   
Group Title: SRG-APP-000508 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 67 of 253 

Rule ID: SV-84035r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000870   
Rule Title: The application must generate audit records for all direct access to the information system. 

Vulnerability Discussion: Without generating audit records that are specific to the security and mission needs of  the organization, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

When an application provides direct access to underlying OS features and functions, that access must be audited. Audit records can be generated from various components within the information system (e.g., module or policy  filter). 

Check Content:   
Review the application documentation and interview the application administrator. 

Identify if the application implements a direct access feature or function that allows users to directly access the  underlying OS. 

Direct access includes but is not limited to: executing OS commands, navigating the file system, manipulating  system resources such as print queues, or reading files hosted on the OS that are not specifically shared or made  available on the website. 

If the application does not provide direct access to the system, this requirement is not applicable. Access the application logs. 

Access the application as a user or test user with appropriate permissions and attempt to execute application  features and functions that provide direct access to the system. 

Review the logs and ensure the actions executed were logged. 

Log information must include the user responsible for executing the action, the action executed, and the result of  the action. 

If the application does not log all direct access to the system, this is a finding. 

Fix Text: Configure the application to log all direct access to the system. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69415   
Group Title: SRG-APP-000509   
Rule ID: SV-84037r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000880   
Rule Title: The application must generate audit records for all account creations, modifications, disabling, and  termination events. 

Vulnerability Discussion: When application user accounts are created, modified, disabled or terminated the  event must be logged. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 68 of 253 

Centralized management of user accounts allows for rapid response to user related security events and also  provides ease of management. 

Allowing the centralized user management solution to log these events is acceptable practice; however, if the  application provides a user management interface to manage these tasks, the application must also log these  events. 

Application developers are encouraged to integrate their applications with enterprise-level    
authentication/access/audit mechanisms such as Syslog, Active Directory or LDAP. 

Check Content:   
Log on to the application as an administrative user. 

Navigate to the user account management functionality. If no user management capability exists within the  application, refer to the Enterprise Active Directory or LDAP user management interfaces. 

Monitor and review the log where the application's user activity is recorded. 

Create an application test account and then review the log to ensure a log record that documents the event is  created. 

Modify the test account and then review the log to ensure a log record that documents the event is created. Disable the test account and then review the log to ensure a log record that documents the event is created. 

Terminate/Remove the test account and then review the log to ensure a log record that documents the event is  created. 

If log events are not created that document all of these events, this is a finding. 

If some, but not all of the aforementioned events are documented in the logs, this is a finding. 

Findings should document which of the events was not logged. 

Fix Text: Configure the application to log user account creation, modification, disabling, and termination events. 

CCI: CCI-000172   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69419   
Group Title: SRG-APP-000092   
Rule ID: SV-84041r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000910   
Rule Title: The application must initiate session auditing upon startup. 

Vulnerability Discussion: If the application does not begin logging upon startup, important log events could be  missed. 

Check Content:   
Examine the application design documentation and interview the application administrator to identify application  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 69 of 253 

logging behavior. 

If the application is writing to an existing log or log file: 

Open and monitor the application log. 

Start the application service and view the log entries.  

Log entries indicating the application is starting should commence as soon as the application starts. Determine if  the log events correlate with the time the application was started and if event log entries include an application  start up sequence of events. 

If the application writes events to a new log on startup:  

Identify location logs are written to, start the application and then identify and access the new log. 

Determine if the log events correlate with the time the application was started and if event log entries include an  application start up sequence of events. 

If the application does not begin logging events upon start up, this is a finding. 

Fix Text: Configure the application to begin logging application events as soon as the application starts up. 

CCI: CCI-001464   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69421   
Group Title: SRG-APP-000095   
Rule ID: SV-84043r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000940   
Rule Title: The application must log application shutdown events. 

Vulnerability Discussion: Forensics is a large part of security incident response. Applications must provide a  record of their actions so application events can be investigated post-event.  

Attackers may attempt to shut off the application logging capability to cover their activity while on the system.  Recording the shutdown event and the time it occurred in the application or system logs helps to provide forensic  evidence that aids in investigating the events. 

Check Content:   
Review and monitor the application and system logs. 

If an application shutdown event is not recorded in the logs, either initiate a shutdown event and review the logs  after reestablising access or request backup copies of the application or system logs that indicate shutdown events  are being recorded. 

Alternatively, check for a setting within the application that controls application logging events and determine if  application shutdown logging is configured. 

If the application is not recording application shutdown events in either the application or system log, or if the  application is not configured to record shutdown events, this is a finding. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 70 of 253 

Fix Text: Configure the application or application server to record application shutdown events in the event logs. 

CCI: CCI-000130   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69423   
Group Title: SRG-APP-000095   
Rule ID: SV-84045r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000950   
Rule Title: The application must log destination IP addresses. 

Vulnerability Discussion: The IP addresses of the systems that the application connects to are an important  aspect of identifying application network related activity. Recording the IP addresses of the system the application  connects to in the application logs provides forensic evidence and aids in investigating and correlating the sources  of malicious behavior related to security events. Logging this information can be particularly useful for Service Oriented Applications where there is application to application connectivity. 

Check Content:   
If the application design documentation indicates the application does not initiate connections to remote systems  this requirement is not applicable. 

Network connections to systems used for support services such as DNS, AD, or LDAP may be stored in the  system logs. These connections are applicable. 

Identify log source based upon application architecture, design documents and input from application admin. Review and monitor the application or system logs. 

Connect to the application and utilize the application functionality that initiates connections to a destination  system. 

If the application routinely connects to remote system on a regular basis you may simply allow the application to  operate in the background while the logs are observed. 

Observe the log activity and determine if the log includes an entry to indicate the IP address of the destination  system. 

If the IP address of the remote system is not recorded along with the event in the event log, this is a finding. Fix Text: Configure the application to record the destination IP address of the remote system. 

CCI: CCI-000130   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69425   
Group Title: SRG-APP-000095   
Rule ID: SV-84047r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000960   
Rule Title: The application must log user actions involving access to data. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 71 of 253 

Vulnerability Discussion: When users access application data, there is risk of data compromise or seepage if the  account used to access is compromised or access is granted improperly. To be able to investigate which account  accessed data, the account access must be logged. Without establishing when the access event occurred, it would  be difficult to establish, correlate, and investigate the events relating to an incident, or identify those responsible  for one. 

Associating event types with detected events in the application and audit logs provides a means of investigating an  attack; recognizing resource utilization or capacity thresholds; or identifying an improperly configured  application. 

Check Content:   
Review and monitor the application logs. When accessing data, the logs are most likely database logs. 

If the application design documents include specific data elements that require protection, ensure user access to  those data elements are logged. 

Utilize the application as a regular user and operate the application so as to access data elements contained within  the application. This includes using the application user interface to browse through data elements, query/search  data elements and using report generation capability if it exists. 

Observe and determine if the application log includes an entry to indicate the user’s access to the data was  recorded. 

If successful access to application data elements is not recorded in the logs, this is a finding. 

Fix Text: Identify the specific data elements requiring protection and audit access to the data. 

CCI: CCI-000130   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69427   
Group Title: SRG-APP-000095   
Rule ID: SV-84049r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000970   
Rule Title: The application must log user actions involving changes to data. 

Vulnerability Discussion: When users change/modify application data, there is risk of data compromise if the  account used to access is compromised or access is granted improperly. To be able to investigate which account  accessed data, the account making the data changes must be logged. Without establishing when the data change  event occurred, it would be difficult to establish, correlate, and investigate the events relating to an incident, or  identify those responsible for one. 

Associating event types with detected events in the application and audit logs provides a means of investigating an  attack; recognizing resource utilization or capacity thresholds; or identifying an improperly configured  application. 

Check Content:   
Review and monitor the application logs. When modifying data, the logs are most likely database logs. If the application design documents include specific data elements that require protection, ensure any changes to  

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 72 of 253 

those specific data elements are logged. Otherwise, a random check is sufficient. 

If the application uses a database configured to use Transaction SQL logging this is not a finding if the application  admin can demonstrate a process for reviewing the transaction log for data changes. The process must include  using the transaction log and some form of query capability to identify users and the data they changed within the  application and vice versa. 

Utilize the application as a regular user and operate the application so as to modify a data element contained  within the application. 

Observe and determine if the application log includes an entry to indicate the users data change event was  recorded. 

If successful changes/modifications to application data elements are not recorded in the logs, this is a finding. Fix Text: Configure the application to log all changes to application data. 

CCI: CCI-000130   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69429   
Group Title: SRG-APP-000096   
Rule ID: SV-84051r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000980   
Rule Title: The application must produce audit records containing information to establish when (date and time)  the events occurred. 

Vulnerability Discussion: Without establishing when events occurred, it is impossible to establish, correlate, and  investigate the events relating to an incident. 

In order to compile an accurate risk assessment, and provide forensic analysis, it is essential for security personnel  to know when events occurred (date and time). 

Check Content:   
Access the application logs and review the log entries for date and time. Each event written into the log must have  a corresponding date and time stamp associated with it. 

If the audit logs do not have a corresponding date and time associated with each event, this is a finding. 

Fix Text: Configure the application or application server to include the date and the time of the event in the audit  logs. 

CCI: CCI-000131   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69431   
Group Title: SRG-APP-000097   
Rule ID: SV-84053r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-000990 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 73 of 253 

Rule Title: The application must produce audit records containing enough information to establish which  component, feature or function of the application triggered the audit event. 

Vulnerability Discussion: It is impossible to establish, correlate, and investigate the events relating to an incident  if the details regarding the source of the event it not available. 

In order to compile an accurate risk assessment, and provide forensic analysis, it is essential for security personnel  to know where within the application the events occurred, such as which application component, application  modules, filenames, and functionality. 

Associating information about where the event occurred within the application provides a means of quickly  investigating an attack; recognizing resource utilization or capacity thresholds; or identifying an improperly  configured application. 

Check Content:   
Review application administration and/or design documents. 

Identify key aspects of application architecture objects and components, e.g., Web Server, Application server,  Database server. 

Interview the application administrator and identify the log locations. 

Access the application logs and review the log entries for events that indicate the application is auditing the  internal components, objects, or functions of the application. 

Confirm the event logs provide information as to which component, feature, or functionality of the application  triggered the event. 

Examples of the types of events to look for are as follows: 

\- Application and Protocol events. e.g., Application loads or unloads and Protocol use.   
\- Data Access events. e.g., Database connections. 

Events could include reference to database library or executable initiating connectivity: 

\- Middleware events. e.g., Source code initiating calls or being invoked.   
\- Name of application modules being loaded or unloaded.   
\- Library loads and unloads.   
\- Application deployment activity. 

Events written into the log must be able to be traced back to the originating component, feature or function name,  service name, application name, library name etcetera in order to establish which aspect of the application  triggered the event. 

If the audit logs do not contain enough data in the logs to establish which component, feature or functionality of  the application triggered the event, this is a finding. 

Fix Text: Configure the application to log which component, feature or functionality of the application triggered  the event. 

CCI: CCI-000132   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 74 of 253 

Group ID (Vulid): V-69433   
Group Title: SRG-APP-000098   
Rule ID: SV-84055r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001000   
Rule Title: When using centralized logging; the application must include a unique identifier in order to  distinguish itself from other application logs. 

Vulnerability Discussion: Without establishing the source, it is impossible to establish, correlate, and investigate  the events leading up to an outage or attack. 

In the case of centralized logging, or other instances where log files are consolidated, there is risk that the  application's log data could be co-mingled with other log data. To address this issue, the application itself must be  identified as well as the application host or client name.  

In order to compile an accurate risk assessment, and provide forensic analysis, it is essential for security personnel  to know the source of the event, particularly in the case of centralized logging. 

Associating information about the source of the event within the application provides a means of investigating an  attack; recognizing resource utilization or capacity thresholds; or identifying an improperly configured  application. 

Check Content:   
If the application is logging locally and does not utilize a centralized logging solution, this requirement is not  applicable. 

Review system documentation and identify log location. Access the application logs. 

Review the application logs. 

Ensure the application is uniquely identified either within the logs themselves or via log storage mechanisms. 

Ensure the hosts or client names hosting the application are also identified. Either hostname or IP address is  acceptable. 

If the application name and the hosts or client names are not identified, this is a finding. 

Fix Text: Configure the application logs or the centralized log storage facility so the application name and the  hosts hosting the application are uniquely identified in the logs. 

CCI: CCI-000133   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69435   
Group Title: SRG-APP-000099   
Rule ID: SV-84057r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001010   
Rule Title: The application must produce audit records that contain information to establish the outcome of the  events. 

Vulnerability Discussion: Without information about the outcome of events, security personnel cannot make an  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 75 of 253 

accurate assessment as to whether an attack was successful or if changes were made to the security state of the  system. 

Event outcomes can include indicators of event success or failure and event-specific results (e.g., the security state  of the information system after the event occurred). As such, they also provide a means to measure the impact of  an event and help authorized personnel to determine the appropriate response. 

Successful application events are expected to far outnumber errors. Therefore, success events may be implied by  default and not specified in the logs if this behavior is documented. 

Check Content:   
Review system and application documentation to identify application operation and function. 

Access the application logs and review the logs to determine if the results of application operations are logged. 

Successful application events are expected to far outnumber errors. Therefore, success events may be implied by  default and not specified in the logs if this behavior is documented. 

The outcome will be a log record that displays the application event/operation that occurred followed by the result  of the operation such as "ERROR", "FAILURE", "SUCCESS" or "PASS". 

Operation outcomes may also be indicated by numeric code where a "1" might indicate success and a "0" may  indicate operation failure. 

If the application does not produce audit records that contain information regarding the results of application  operations, this is a finding. 

Fix Text: Configure the application to include the outcome of application functions or events. 

CCI: CCI-000134   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69437   
Group Title: SRG-APP-000100   
Rule ID: SV-84059r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001020   
Rule Title: The application must generate audit records containing information that establishes the identity of any  individual or process associated with the event. 

Vulnerability Discussion: Without information that establishes the identity of the subjects (i.e., users or  processes acting on behalf of users) associated with the events, security personnel cannot determine responsibility  for the potentially harmful event. 

Event identifiers (if authenticated or otherwise known) include, but are not limited to, user database tables,  primary key values, user names, or process identifiers. 

Check Content:   
Review system documentation and discuss application operation with application administrator. 

Identify application processes and application users.   
Identify application components, e.g., application features framework and function. Identify server components,  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 76 of 253 

such as web server, database server. 

Review application logs. Ensure the application event logs include an identifier or identifiers that will allow an  investigator to determine the user or the application process responsible for the application event. 

If the event logs do not include the appropriate identifier or identifiers, this is a finding. 

Fix Text: Configure the application to log the identity of the user and/or the process associated with the event. 

CCI: CCI-001487   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69439   
Group Title: SRG-APP-000101   
Rule ID: SV-84061r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001030   
Rule Title: The application must generate audit records containing the full-text recording of privileged commands  or the individual identities of group account users. 

Vulnerability Discussion: Reconstruction of harmful events or forensic analysis is not possible if audit records  do not contain enough information. 

Organizations consider limiting the additional audit information to only that information explicitly needed for  specific audit requirements. The additional information required is dependent on the type of information (i.e.,  sensitivity of the data and the environment within which it resides). At a minimum, the organization must audit  either full-text recording of privileged commands or the individual identities of group users, or both. The  organization must maintain audit trails in sufficient detail to reconstruct events to determine the cause and impact  of compromise.  

In addition, the application must have the capability to include organization-defined additional, more detailed  information in the audit records for audit events. 

Check Content:   
Review application documentation and interview application administrator. Identify audit log locations and review  audit logs. 

Access the system as a privileged user and execute privileged commands. 

Review the application logs and ensure that the logs contain all details of the actions performed.  

If a privileged command was typed within the application that command text must be included in the logs.  Authentication information provided as part of the text must NOT be logged, just the commands. 

If an action was performed, such as activating a check box, that action must be logged. 

Review group account users, review logs to determine if the individual users of group accounts are identified in  the logs. 

If the application does not log the full text recording of privileged commands or if the application does not identify  and log the individuals associated with group accounts, this is a finding. 

Fix Text: Configure the application to log the full text recording of privileged commands or the individual  file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 77 of 253 

identities of group users. 

CCI: CCI-000135   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69441   
Group Title: SRG-APP-000101   
Rule ID: SV-84063r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001040   
Rule Title: The application must implement transaction recovery logs when transaction based. 

Vulnerability Discussion: Without required logging and access control, security issues related to data changes  will not be identified. This could lead to security compromises such as data misuse, unauthorized changes, or  unauthorized access. 

Transaction logs contain a sequential record of all changes to the database. Using a transaction log helps with  maintaining application availability and aids in speedy recovery. Transactional logging should be enabled  whenever the application database offers the transactional logging capability. 

Check Content:   
Review the application documentation and interview the application administrator. Have the application  administrator provide configuration settings that demonstrate transaction logging is enabled. 

Review configuration settings for the location of transaction specific logs and verify transaction logs exist and the  log records access and changes to the data. 

If the application is not configured to utilize transaction logging, this is a finding. 

Fix Text: Configure the application database to utilize transactional logging. 

CCI: CCI-000135   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69443   
Group Title: SRG-APP-000356   
Rule ID: SV-84065r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001050   
Rule Title: The application must provide centralized management and configuration of the content to be captured  in audit records generated by all application components. 

Vulnerability Discussion: Without the ability to centrally manage the content captured in the audit records,  identification, troubleshooting, and correlation of suspicious behavior would be difficult and could lead to a  delayed or incomplete analysis of an ongoing attack. 

This requirement requires that the content captured in audit records be managed from a central location  (necessitating automation). Centralized management of audit records and logs provides for efficiency in  maintenance and management of records, as well as the backup and archiving of those records. Application  components requiring centralized audit log management must have the capability to support centralized  management. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 78 of 253 

This requirement applies to centralized management applications or similar types of applications designed to  manage and configure audit record capture. 

Check Content:   
Review the application documentation and interview the application administrator to determine the logging  architecture of the application. 

If the application is configured to log application event entries to a centralized, enterprise based logging solution  that meets this requirement, the requirement is not applicable. 

Review the application components and the log management capabilities of the application. 

Verify the application log management interface includes the ability to centrally manage the configuration of what  is captured in the logs of all application components.  

If the application does not provide the ability to centrally manage the content captured in the audit logs, this is a  finding. 

Fix Text: Configure the application to utilize a centralized log management system that provides the capability to  configure the content of audit records. 

CCI: CCI-001844   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69445   
Group Title: SRG-APP-000358   
Rule ID: SV-84067r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001070   
Rule Title: The application must off-load audit records onto a different system or media than the system being  audited. 

Vulnerability Discussion: Information stored in one location is vulnerable to accidental or incidental deletion or  alteration. In addition, attackers often manipulate logs to hide or obfuscate their activity. 

The goal is to off-load application logs to a separate server as quickly and efficiently as possible so as to mitigate  these risks.  

A centralized logging solution offering applications an enterprise designed and managed logging capability which  is the desired solution. 

However, when a centralized logging solution is not an option due to the operational environment or other  situations where the risk has been officially recognized and accepted, off-loading is a common process utilized to  address this type of scenario. 

Check Content:   
Review application documentation and interview application administrator. Identify log functionality and  locations of log files. Obtain risk acceptance documentation and task scheduling information. 

If the application is configured to utilize a centralized logging solution, this requirement is not applicable. file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 79 of 253 

Evaluate log management processes and determine if there are automated tasks that move the logs off of the  system hosting the application.  

Verify automated tasks are performed on an ISSO approved schedule (hourly, daily etc.). Automation can be via  scripting, log management oriented tools or other automated means. 

Review risk acceptance documentation for not utilizing a centralized logging solution. 

If the logs are not automatically moved off the system as per approved schedule, or if there is no formal risk  acceptance documentation, this is a finding. 

Fix Text: Configure the application to off-load audit records onto a different system as per approved schedule. 

CCI: CCI-001851   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69447   
Group Title: SRG-APP-000515   
Rule ID: SV-84069r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001080   
Rule Title: The application must be configured to write application logs to a centralized log repository. 

Vulnerability Discussion: Information stored in one location is vulnerable to accidental or incidental deletion or  alteration. In addition, attackers often manipulate logs to hide or obfuscate their activity. 

Off-loading is a common process in information systems with limited audit storage capacity or when trying to  assure log availability and integrity. 

This requirement is meant to address space limitations and integrity issues that can be encountered when storing  logs on the local server. 

The goal of the requirement being to offload application logs to a separate server as quickly and efficiently as  possible so as to mitigate these risks. 

Check Content:   
Review application documentation and interview application administrator. 

Evaluate application log management processes and determine if the system is configured to utilize a centralized  log management system for the hosting and management of application audit logs. 

If the system is not configured to write the application logs to the centralized log management repository in an  expeditious manner, this is a finding. 

Fix Text: Configure the application to utilize a centralized log repository and ensure the logs are off-loaded from  the application system as quickly as possible. 

CCI: CCI-001851   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_Group ID (Vulid): V-69449 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019  
UNCLASSIFIED Page 80 of 253 

Group Title: SRG-APP-000359   
Rule ID: SV-84071r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001090   
Rule Title: The application must provide an immediate warning to the SA and ISSO (at a minimum) when  allocated audit record storage volume reaches 75% of repository maximum audit record storage capacity. 

Vulnerability Discussion: If security personnel are not notified immediately upon storage volume utilization  reaching 75%, they are unable to plan for storage capacity expansion. 

Due to variances in application usage and audit records storage usage, the SA and the ISSO may evaluate usage  patterns and determine if a higher percentage of usage is warranted before an alarm is sent. The intent of the  requirement is to provide a warning that will allow the SA and ISSO ample time to plan and implement an audit  storage capacity expansion that will provide for the increased audit log storage requirements without forcing an  emergency or otherwise negatively impacting the recording of audit events. 

The requirement will take into account a reasonable amount of processing time such as 1 or 2 minutes that may be  required of the system in order to satisfy the requirement. 

Check Content:   
Review system documentation and interview application administrator for details regarding logging configuration.  

If the application utilizes a centralized logging system that provides storage capacity alarming, this requirement is  not applicable. 

Identify application alarming capability relating to storage capacity alarming for the log repository. Coordinate  with the appropriate personnel regarding the generation of test alarms. 

Review log alarm settings and ensure audit log storage capacity alarming is enabled and set to alarm when the  storage threshold exceeds 75% of disk storage capacity or the capacity value the SA and ISSO have determined  will provide adequate time to plan for capacity expansion. 

Ensure the alarm will be sent to the ISSO and the application administrator when the utilization threshold is  exceeded by changing the threshold settings to below the current disk space utilization. An alarm should be  triggered at that point and forwarded to the ISSO and the SA/application admin. 

If the application is not configured to send an alarm when storage volume exceeds 75% of disc capacity or if the  designated alarm recipients did not receive an alarm when the test was conducted, this is a finding. 

Fix Text: Configure the application to send an immediate alarm to the application admin/SA and the ISSO when  the allocated log storage capacity exceeds 75% of usage or exceeds the capacity value the SA and ISSO have  determined will provide adequate time to plan for capacity expansion. 

CCI: CCI-001855   
\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Group ID (Vulid): V-69451   
Group Title: SRG-APP-000360   
Rule ID: SV-84073r1\_rule   
Severity: CAT II   
Rule Version (STIG-ID): APSC-DV-001100   
Rule Title: Applications categorized as having a moderate or high impact must provide an immediate real-time  alert to the SA and ISSO (at a minimum) for all audit failure events. 

file:///C:/Users/slewis/Documents/U\_ASD\_V4R9\_STIG/U\_ASD\_V4R9\_Manual\_STIG/U\_... 9/9/2019

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAApQAAADGCAYAAABsFhDpAACAAElEQVR4XuzdB0CUV7428L2b3U1sYK8xFordGHtBjb33rmChSVUQxEoVK2IXFBFFbNh7iS3W2Eus9N57m2Hq853zfwckZLP75WZzs0nOY34BB5gZQA7PW855/wIRERERERERERGRX5C/VL5BRERERERERERE5OdEFEoREREREREREZFfFFEoRUREREREREREflFEoRQREREREREREflFEYVSRERERERERETkF0UUShERERERERERkV8UUShFRERERERERER+UUShFBERERERERER+UURhVJEREREREREROQXRRRKERERERERERGRXxRRKEVERERERERERH5RRKEUERERERERERH5RRGFUkRERERERERE5BdFFEoREREREREREZFfFFEoRUREREREREREflFEoRQREREREREREflFEYXyzxjtT/iVUvlhfvrh/v17iIiIiPwW+a1GJG2FPz8eIysTEfntIgrlnzGVx6BfeSyq/DA//XD//j1EREREfov8ViOSKJQiv5eIQvlnCx9zND+hfFzSVvDx9spDlzR8VboTLffDdyp7q7rSe0tv5v8vu0Wlw9+Tkx7hx6n8xCveo4iIiMjPT+WxrbLyEabyG35Eq8PHQv6y8tv57WUqv+3HNGwsLKP9p1Q6fMwUEfntIgrlnyx8fNOw/3FaNqBVxge5H95WcUDkr3/E3/ajP3T7j96VaMrGUN3ff3Sf/B3onSq+wz8rjf+KiIiIyP8ilQcsHWlM+zi2/WjI+Un84yvfVvlxKr/tx7QabbnKz01SYWAVEfkNIwrlnyx8yKm4bcsqo+7/El7aysph2S0fyyLbAtaqfuBHY1tFusf74cD304VTKq8V0EdXLpSciIiIyH82H4edsjGo8linpjGqbGT6d6RXKo5humM05ff/44/5p/hjEv6x7D40Ov9kPBUR+S0jCuWfLHzMEYVSRERE5If5OOyUjUGVxzpRKEVE/lVEofyTRRp4ygaojwMRDUY65bfx8YrGLOn9f3jujzRISrWz8jk9Pzy352Nd/WFV/bGyc4HKlN1e9tSkwfxfh7+HKJ4iIiI/Lx9L2cfRRiqQFV7n71PxDz8tqGyc4q9XHFBpGOKv8/JXtjHOX358+8exuMJ90f3oRsuKj09/Pr69rKBW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>