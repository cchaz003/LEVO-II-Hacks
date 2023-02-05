load('api_config.js');
load('api_events.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');
load('api_aws.js');
load('api_uart.js');

let state = {
    "dtemp": 0,
    "type": 0,
    "dstat": -1,
    "status": 0,
    "units": 0,
    "name": "",
    "upd_at": "",
    "time": 0,
    "newtype":-1,
    "newtemp":-1,
    "newtime":-1,
    "begin":0,
    "inf":0
};
print('VERSION_1_0_3');
let isWifiConnected = false;
let uartNo = 0;
let uartbuff = "";
let uartCommand = "";

function getName() {
    if(state.name === "") {
        return "";
    } else {
        return state.name + " is";
    }
}
function getCalculatedStatus() {
    if(state.dstat === -1) {
        return state.status;
    } else {
        return state.dstat;
    }
}
function reportState() {
    if(isWifiConnected) {
        AWS.Shadow.update(0, state);
    }
}
function updateState(newState) {
    let ctemp = state.dtemp;
    let timeUpdated = false;
    if(newState.dtemp !== undefined) {
        state.dtemp = newState.dtemp;
        state.newtemp = -1;

    }
    if(newState.type !== undefined) {
        state.type = newState.type;
        state.newtype = -1;
    }
    if(newState.time !== undefined) {
        if(newState.time !== state.time) {
            timeUpdated = true;
        }
        state.time = newState.time;
        state.newtime = -1;
    }
    if(newState.units !== undefined) {
        state.units = newState.units;
    }
    if(newState.begin !== undefined) {
        state.begin = newState.begin;
    }
    if(newState.upd_at !== undefined) {
        state.upd_at = newState.upd_at;
    }
    if(newState.inf !== undefined) {
        state.inf = newState.inf;
    }
    if(newState.name !== undefined) {
        state.name = newState.name;
    }
    if(newState.status !== undefined) {
        if((state.status === 0 || state.status === 1 || state.status === 3 || state.status === 6 || state.status === 9) && newState.status === 2) {
            state.status = newState.status;
            warmUp();
        } else if (newState.status === 0 || newState.status === 3 || newState.status === 6 || newState.status === 9) {
            state.status = newState.status;
            state.dstat = -1;
            let now = Timer.now();
            state.upd_at = ((now|0)/60)|0;
            stopCycle();
        } else if ((state.status === 4 || state.status === 7 || state.status === 10 || state.status === 2) && newState.status === 2) {
            state.status = newState.status;
            warmUp();
        } else {
            state.status = newState.status;
            state.dstat = -1;
            let current_state = getCurrentState();
            print('STATE_UPDATED',JSON.stringify(current_state));
        }
    } else {
        let current_state = getCurrentState();
        print('STATE_UPDATED',JSON.stringify(current_state));
    }
    if(state.dtemp < ctemp && (state.status === 4 || state.status === 7 || state.status === 10)) {
        let ltPayload = {};
        ltPayload.dtemp = state.dtemp;
        if(timeUpdated) {
            ltPayload.time = state.time;
            let now = Timer.now();
            state.upd_at = (((now|0) + state.time * 60)/60)|0;
        } else {
            ltPayload.time = 0;
        }
        print('LOWER_TEMP',JSON.stringify(ltPayload));
    }
    reportState();
}
function getCurrentState() {
    let cstate = {};
    cstate.display_name = getName();
    cstate.status_text = "";
    cstate.units = state.units;
    cstate.status = getCalculatedStatus();
    return cstate;
}
function warmUp() {
    state.status = 2;
    state.dstat = -1;
    let desired_data = {"dtemp": state.dtemp, "type": state.type, "time": state.time, "status": state.status};
    print('CYCLE_START', JSON.stringify(desired_data));
    let current_state = getCurrentState();
    print('STATE_UPDATED', JSON.stringify(current_state));
}
function startCycle() {
    if(state.type === 0) {
        // Drying
        state.dstat = 7;
    } else if (state.type === 1) {
        //Activating
        state.dstat = 10;
    } else if (state.type === 2) {
        //Infusing
        state.dstat = 4;
    }
    let now = Timer.now();
    state.upd_at = (((now|0) + state.time * 60)/60)|0;
    state.begin = ((now|0)/60)|0;
    let current_state = getCurrentState();
    print('STATE_UPDATED',JSON.stringify(current_state));
    reportState();
}
function stopCycle() {
    let desired_data = {"type":state.type,"status":state.status};
    print('CYCLE_STOP',JSON.stringify(desired_data));
    let current_state = getCurrentState();
    print('STATE_UPDATED',JSON.stringify(current_state));
}
function resetCycle() {
    let now = Timer.now();
    state.dstat = 0;
    state.upd_at = ((now|0)/60)|0;
    let current_state = getCurrentState();
    print('STATE_UPDATED',JSON.stringify(current_state));
    reportState();
}
function completeCycle() {
    if(state.type === 0) {
        // Drying
        state.dstat = 8;
    } else if (state.type === 1) {
        //Activating
        state.dstat = 11;
    } else if (state.type === 2) {
        //Infusing
        state.dstat = 5;
    }
    let current_state = getCurrentState();
    print('STATE_UPDATED',JSON.stringify(current_state));
    reportState();
}
function newState(nState) {
    let now = Timer.now();
    if(typeof nState.dstat !== 'undefined') {
        state.dstat = nState.dstat;
        if(state.dstat === 6 || state.dstat === 3 || state.dstat === 9) {
            state.upd_at = ((now|0)/60)|0;
        } else if (state.dstat === 2 && state.inf !== 0) {
            state.upd_at = ((now|0)/60)|0;
        }
    }
    if(typeof nState.newtemp !== 'undefined') {
        state.newtemp = nState.newtemp;
    }
    if(typeof nState.newtime !== 'undefined') {
        state.newtime = nState.newtime;
        if(state.dstat === 4 || state.dstat === 7 || state.dstat === 10 ) {
            state.upd_at = (((now|0) + state.newtime * 60)/60)|0;
        }
    }
    if(typeof nState.newtype !== 'undefined') {
        state.newtype = nState.newtype;
    }
    reportState();
}
function initUart() {
    UART.setDispatcher(uartNo, function(uartNo, ud) {
        let ra = UART.readAvail(uartNo);
        if (ra > 0) {
            let data = UART.read(uartNo);
            if (data === '\r') {
                if (uartbuff === 'ESP2AP') {                   //reboot command from STM32(MCU)
                    Cfg.set({wifi: {sta: {enable: false, ssid: '', password: ''}}}); //Empty the ssid and password stored.
                    Cfg.set({wifi: {ap: {enable: true, hidden:false}}});       //set to AP mode for WiFi pair
                    print("ESP_RCVED:", uartbuff);					//reply to STM32(MCU)
                    Sys.reboot(500000);          				//reboot after 500000us, delay 500ms for make sure the setting are saved.
                } else {

                    let command = "";
                    let rdata="";
                    if(uartCommand === "") {
                        command = uartbuff;
                    } else {
                        command = uartCommand;
                        rdata = uartbuff;
                    }
                    if (command === 'WARMUP_COMPLETE') {
                        startCycle();
                    } else if (command === 'RESET_CYCLE') {
                        resetCycle();
                    } else if (command === 'CYCLE_COMPLETE') {
                        completeCycle();
                    } else if (command === 'UPDATE_STATE') {
                        command = "";
                        if(rdata !== '') {
                            let jsondata = JSON.parse(rdata);
                            newState(jsondata);
                        }
                    }
                }
                uartCommand = "";
                uartbuff = "";                                         //clear buff
            } else if (data === '|') {
                uartCommand = uartbuff;
                uartbuff = "";
            } else {
                uartbuff = uartbuff + data;
            }
        }
    }, null);
    UART.setRxEnabled(uartNo, true);
}
AWS.Shadow.setStateHandler(function(ud, ev, reported, desired) {
    if (ev === AWS.Shadow.CONNECTED) {
        reportState();
        return;
    }
    if (ev !== AWS.Shadow.GET_ACCEPTED && ev !== AWS.Shadow.UPDATE_DELTA) {
        return;
    }
    updateState(reported);
    updateState(desired);
    if (ev === AWS.Shadow.UPDATE_DELTA) {
        //reportState();
    }
}, null);
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
    if (ev === Net.STATUS_DISCONNECTED) {
        print("WIFI_DISCONNECTED");
        isWifiConnected = false;
    } else if (ev === Net.STATUS_CONNECTING) {
        print("WIFI_CONNECTING");
        isWifiConnected = false;
    } else if (ev === Net.STATUS_CONNECTED) {
        print("WIFI_CONNECTED");
        isWifiConnected = true;
    } else if (ev === Net.STATUS_GOT_IP) {
        isWifiConnected = true;
    }
}, null);
UART.setConfig(uartNo, {
    baudRate: 115200,
    rxBufSize: 1024,
    txBufSize: 1024
});
Timer.set(10000, Timer.REPEAT, function(){
    initUart();
}, null);