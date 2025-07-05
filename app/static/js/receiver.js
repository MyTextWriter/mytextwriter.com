
        const actionButton = document.getElementById('action-button');
        const mobileToolbar = document.getElementById('mobile-toolbar');
        const mobileMenuButton = document.getElementById('mobile-menu-button');
        const downloadButtonMobile = document.getElementById('download-button-mobile');
        const clearButtonMobile = document.getElementById('clear-button-mobile');
        const appHeader = document.getElementById('app-header');
        const editor = document.getElementById('editor');
        const WritingUser = document.getElementById('writing-user');
        const usersIndicator = document.getElementById('users-indicator');


        let toolbarVisible = false;

        actionButton.addEventListener('click', () => {
            toggleToolbar();
        });

        mobileMenuButton.addEventListener('click', () => {
            toggleToolbar();
        });

        function toggleToolbar() {
            if (toolbarVisible) {
                mobileToolbar.classList.remove('toolbar-slide-up');
                mobileToolbar.classList.add('toolbar-slide-down');
                setTimeout(() => {
                    mobileToolbar.classList.add('hidden');
                    mobileToolbar.classList.remove('toolbar-slide-down');
                }, 300);
            } else {
                mobileToolbar.classList.remove('hidden');
                mobileToolbar.classList.add('toolbar-slide-up');
            }
            toolbarVisible = !toolbarVisible;
        }

        const originalHeight = window.innerHeight;

        window.addEventListener('resize', () => {
            const currentHeight = window.innerHeight;
            if (currentHeight < originalHeight) {
                appHeader.classList.add('header-compact');
                actionButton.classList.add('hidden');
                usersIndicator.classList.add('hidden');
                if (toolbarVisible) {
                    toggleToolbar();
                }
            } else {
                appHeader.classList.remove('header-compact');
                actionButton.classList.remove('hidden');
                usersIndicator.classList.remove('hidden');
            }
        });

        downloadButtonMobile.addEventListener('click', () => {
            const content = editor.value;
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'document.txt';
            a.click();
            window.URL.revokeObjectURL(url);


            if (toolbarVisible) {
                toggleToolbar();
            }
        });

        clearButtonMobile.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the text?')) {
                editor.value = '';
                sendText('');
            }
            if (toolbarVisible) {
                toggleToolbar();
            }
        });


        function toggleDialogAnimation(dialog, show) {
            const content = dialog.querySelector('div');
            if (show) {
                content.classList.remove('opacity-0');
                content.classList.add('opacity-100');
            } else {
                content.classList.remove('opacity-100');
                content.classList.add('opacity-0');
            }
        }


        function validateLink(socketLink) {
            if (!socketLink.startsWith('wss://mytextwriter.com/text_update/')) {
                return false;
            }
            return true;
        }

        var socketElement = document.getElementById('socket-url');
        var socketUrl = socketElement.getAttribute('data-websocket-url');

        if (validateLink(socketUrl)) {
            var socket = new WebSocket(socketUrl);
        } else {
            throw new Error("Invalid WebSocket URL");
        }

        let lastUpdateTime = Date.now();
        let timeoutId;

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.event) {
                case "text_update":
                    if (data.text || data.text === '') {
                        editor.value = data.text;
                    }
                    break;
                case "active_users":
                    WritingUser.textContent = data.payload?.count || 0;
                    break;
                case "exit":
                    const dialog = document.getElementById('exit-dialog');
                    dialog.showModal();
                    toggleDialogAnimation(dialog, true);
                    setTimeout(() => {
                        toggleDialogAnimation(dialog, false);
                        setTimeout(() => {
                            dialog.close();
                            window.location.href = '/';
                        }, 500);
                    }, 3000);
                    break;
                default:
                    console.log("Unknown event");
            }
        };

        function debounce(func, wait) {
            let timeout;
            return function (...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        }

        const sendText = debounce(function (text) {
            const payload = {
                event: "text_update",
                text: text
            };
            socket.send(JSON.stringify(payload));
        }, 300);

        editor.addEventListener('input', function () {
            var text = editor.value;
            sendText(text);
            clearTimeout(timeoutId);
            lastUpdateTime = Date.now();
        });


        socket.onclose = function (event) {
            let TryReconnect = 0;
            const maxTryReconnect = 5;
            const reconnectInterval = 10000;

            function TryToReconnect() {
                if (TryReconnect < maxTryReconnect) {
                    console.log(`Trying to reconnect... (Try ${TryReconnect + 1})`);
                    setTimeout(() => {
                        socket = new WebSocket(socketUrl);

                        socket.onopen = function () {
                            console.log("Reconnected successfully");
                            TryReconnect = 0;
                        };
                        socket.onclose = function (event) {
                            TryToReconnect();
                        };
                        TryReconnect++;
                    }, reconnectInterval);
                } else {
                    console.error("Maximum reconnect try reached. Connection failed.");
                }
            }

            TryToReconnect();
        };


        const tablockchannel = new BroadcastChannel('tab-lock-tablockchannel-mytextwriter');
        const tabId = Date.now();
        let isOriginalTab = false;

        window.onload = function () {
            tablockchannel.postMessage({ type: 'ping', tabId });
            setTimeout(() => {
                if (!isOriginalTab) {
                    isOriginalTab = true;
                }
            }, 100);

            setTimeout(() => {
                if (window.innerWidth > 768) {
                    editor.focus();
                }
            }, 300);
        };

        tablockchannel.onmessage = function (event) {
            const message = event.data;

            switch (message.type) {
                case 'ping':
                    if (isOriginalTab) {
                        tablockchannel.postMessage({ type: 'pong', tabId });
                    }
                    break;
                case 'pong':
                    if (message.tabId !== tabId) {
                        alert('This site is already open in another tab! Closing this tab.');
                        window.close();
                        window.location.href = '/';
                    }
                    break;
            }
        };

        window.onbeforeunload = () => {
            if (isOriginalTab) {
                tablockchannel.postMessage({ type: 'original_tab_closed', tabId });
            }
        };

        editor.addEventListener('focus', (e) => {
            if (toolbarVisible) {
                toggleToolbar();
            }
        });

        let lastTap = 0;
        document.addEventListener('touchend', function(e) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                if (e.target === editor) {
                    e.preventDefault();
                }
            }
            lastTap = currentTime;
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (socket.readyState !== WebSocket.OPEN) {
                    socket = new WebSocket(socketUrl);
                }
            }
        });
