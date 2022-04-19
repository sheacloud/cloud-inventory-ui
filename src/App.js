import './App.css';
import React, { useEffect, useState, Fragment } from "react";
import { Dropdown, Container, Accordion } from 'react-bootstrap';
import Amplify, { Auth, Hub, API } from "aws-amplify";
import Navigation from "./components/Navigation.js";
import FederatedSignIn from "./components/FederatedSignIn.js";
import { config } from "./Constants.js"

Amplify.configure({
  Auth: {
    region: "us-east-1",
    userPoolId: "us-east-1_Mjgh8prvX",
    userPoolWebClientId: "62cnp2og5414krlo2i494m3osg",
    oauth: {
      domain: "sheacloud.auth.us-east-1.amazoncognito.com",
      scope: ["email", "openid", "aws.cognito.signin.user.admin", "profile"],
      redirectSignIn: config.url.REDIRECT_URL,
      redirectSignOut: config.url.REDIRECT_URL,
      responseType: "code"
    }
  },
  API: {
    endpoints: [
      {
        name: "CloudInventoryAPI",
        endpoint: config.url.API_URL,
        custom_header: async () => {
          // return { Authorization : 'token' } 
          // Alternatively, with Cognito User Pools use this:
          // return { Authorization: `Bearer ${(await Auth.currentSession()).getAccessToken().getJwtToken()}` }
          return {
            Authorization: `Bearer ${(await Auth.currentSession()).getIdToken().getJwtToken()}`,
          }
        }
      }
    ]
  }
});

const federatedIdName = "AzureAD";

function App() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    Hub.listen("auth", ({ payload: { event, data } }) => {
      switch (event) {
        case "signIn":
        case "cognitoHostedUI":
          setToken("grating...");
          getToken().then(userToken => setToken(userToken.idToken.jwtToken));
          break;
        case "signOut":
          setToken(null);
          break;
        case "signIn_failure":
        case "cognitoHostedUI_failure":
          console.log("Sign in failure", data);
          break;
        default:
          break;
      }
    });
  }, []);

  function getToken() {
    return Auth.currentSession()
      .then(session => session)
      .catch(err => console.log(err));
  }

  return (
    <Fragment>
      <Navigation token={token} />
      <Container fluid>
        <br />
        {token ? (
          <Home token={token} />
        ) : (
          <FederatedSignIn federatedIdName={federatedIdName} />
        )}
      </Container>
    </Fragment>
  );
}

class Home extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selected_cloud: 'aws',
      selected_service: 'cloudwatchlogs',
      selected_resource: 'log_groups'
    };
  }

  selectResource = (cloud, service, resource) => {
    console.log("selecting resource " + cloud + " " + service + " " + resource);
    this.setState({
      selected_cloud: cloud,
      selected_service: service,
      selected_resource: resource
    })
  }

  render() {
    return (
      <div>
        <SideBar onClick={this.selectResource} />
        <ResourceView cloud={this.state.selected_cloud} service={this.state.selected_service} resource={this.state.selected_resource} token={this.props.token} />
      </div>
    );
  }
}

class ResourceView extends React.Component {
  constructor(props) {
    super(props);

    const today = new Date();
    this.state = {
      partitionedObjects: {},
      metadata: {},
      filters: {
        report_date: today.toISOString().substring(0, 10),
      },
      populated: false,
    };
  }

  serverRequest = () => {
    var inventoryURL = `v1/inventory/${this.props.cloud}/${this.props.service}/${this.props.resource}`;
    var inventoryRequestOptions = {
      queryStringParameters: {
        report_date: this.state.filters.report_date,
      }
    }
    if ('report_time' in this.state.filters && this.state.filters.report_time !== null) {
      inventoryRequestOptions.queryStringParameters.time_selection = "at"
      inventoryRequestOptions.queryStringParameters.time_selection_reference = this.state.filters.report_time
    }


    var metadataURL = `v1/metadata/${this.props.cloud}/${this.props.service}/${this.props.resource}`;
    var metadataRequestOptions = {
      queryStringParameters: {
        report_date: this.state.filters.report_date,
      }
    }

    Promise.all([
      API.get("CloudInventoryAPI", inventoryURL, inventoryRequestOptions),
      API.get("CloudInventoryAPI", metadataURL, metadataRequestOptions),
    ]).then(([objects, metadata]) => {
      objects = objects[this.props.resource];
      var partitionedObjects = {};
      for (var i = 0; i < objects.length; i++) {
        var object = objects[i];
        if (!(object.account_id in partitionedObjects)) {
          partitionedObjects[object.account_id] = {};
        }
        if (!(object.region in partitionedObjects[object.account_id])) {
          partitionedObjects[object.account_id][object.region] = [];
        }
        partitionedObjects[object.account_id][object.region].push(object);
      }
      this.setState({
        partitionedObjects: partitionedObjects,
        metadata: metadata,
        populated: true,
      });
    })
  }

  componentDidMount() {
    this.serverRequest();
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.cloud !== prevProps.cloud || this.props.service !== prevProps.service || this.props.resource !== prevProps.resource || this.state.filters !== prevState.filters) {
      console.log("making new request")
      this.serverRequest();
    }
  }

  render() {
    if (!this.state.populated) {
      console.log("not populated");
      return (<div />)
    }
    console.log(this.state.metadata)
    return (
      <div class="main">
        <br />
        <h2>Cloud Inventory</h2>
        <p>{this.props.cloud} {this.props.service} {this.props.resource}</p>
        <input type="date" value={this.state.filters.report_date} onChange={(e) => {

          this.setState({ filters: { ...this.state.filters, report_date: e.target.value, report_time: null } })
        }} />
        <Dropdown>
          <Dropdown.Toggle variant="success" id="date-time-selection">
            Date/Time Selection
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {this.state.metadata.datetimes.map((datetime) => {
              var state = ""
              if ('report_time' in this.state.filters && this.state.filters.report_time === datetime) {
                state = "active"
              }
              return (
                <Dropdown.Item active={state} onClick={() => {
                  console.log("clicked " + datetime);
                  this.setState({ filters: { ...this.state.filters, report_time: datetime } })
                }}>
                  {datetime}
                </Dropdown.Item>
              )
            })}
          </Dropdown.Menu>
        </Dropdown>
        <div class="container">
          <Accordion>
            {Object.keys(this.state.partitionedObjects).sort().map((account_id) => {
              return (
                <Accordion.Item eventKey={account_id}>
                  <Accordion.Header>
                    {account_id}
                  </Accordion.Header>
                  <Accordion.Body>
                    <Accordion>
                      {Object.keys(this.state.partitionedObjects[account_id]).sort().map((region) => {
                        return (
                          <Accordion.Item eventKey={`${account_id}-${region}`}>
                            <Accordion.Header>
                              {region}
                            </Accordion.Header>
                            <Accordion.Body>
                              <Accordion>
                                {this.state.partitionedObjects[account_id][region].map((object) => {
                                  return <InventoryObject object={object} display_fields={this.state.metadata.display_fields} id_field={this.state.metadata.id_field} />;
                                })}
                              </Accordion>
                            </Accordion.Body>
                          </Accordion.Item>
                        )
                      })}
                    </Accordion>
                  </Accordion.Body>
                </Accordion.Item>
              )
            })}
          </Accordion>
        </div>
      </div>
    )
  }
}

class InventoryObject extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      open: false
    };
  }

  render() {
    var display_name = ""
    for (var i = 0; i < this.props.display_fields.length; i++) {
      display_name += this.props.object[this.props.display_fields[i]]
      if (i < this.props.display_fields.length - 1) {
        display_name += " "
      }
    }
    var uniqueName = this.props.object[this.props.id_field];
    return (
      <Accordion.Item eventKey={uniqueName}>
        <Accordion.Header>
          {display_name}
        </Accordion.Header>
        <Accordion.Body>
          <pre>{JSON.stringify(this.props.object, null, 2)}</pre>
        </Accordion.Body>
      </Accordion.Item>
    )
  }
}

class SideBar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      clouds: ["aws"]
    }
  }

  render() {
    return (
      <div class="sidenav">
        <Accordion defaultActiveKey="aws">
          {this.state.clouds.map((cloud) => {
            return <CloudTab cloud={cloud} onClick={this.props.onClick} />;
          })}
        </Accordion>
      </div>
    )
  }
}

class CloudTab extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      services: []
    }
  }

  fetchServices = () => {
    var metadataURL = `v1/metadata/${this.props.cloud}/`;
    API.get("CloudInventoryAPI", metadataURL, {}).then(res => {
      this.setState({
        services: res.services
      });
      console.log(this.state.services);
    });
  }
  componentDidMount() {
    this.fetchServices();
  }

  render() {
    return (
      <Accordion.Item eventKey={this.props.cloud}>
        <Accordion.Header>
          {this.props.cloud}
        </Accordion.Header>
        <Accordion.Body>
          <Accordion>
            {this.state.services.map((service) => {
              return <ServiceTab cloud={this.props.cloud} service={service} onClick={this.props.onClick} />;
            })}
          </Accordion>
        </Accordion.Body>
      </Accordion.Item>
    )
  }
}

class ServiceTab extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      resources: []
    }
  }

  fetchResources = () => {
    API.get("CloudInventoryAPI", `v1/metadata/${this.props.cloud}/${this.props.service}`, {}).then(res => {
      this.setState({
        resources: res.resources
      });
    });
  }

  componentDidMount() {
    this.fetchResources();
  }

  render() {
    return (
      <Accordion.Item eventKey={`${this.props.cloud}-${this.props.service}`}>
        <Accordion.Header>
          {this.props.service}
        </Accordion.Header>
        <Accordion.Body>
          <ul class="list-group">
            {this.state.resources.map((resource) => {
              return (
                <li class="list-group-item">
                  <a href="#" onClick={() => this.props.onClick(this.props.cloud, this.props.service, resource)}>{resource}</a>
                </li>
              )
            })}
          </ul>
        </Accordion.Body>
      </Accordion.Item>
    )
  }
}

export default App;
