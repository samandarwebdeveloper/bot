const { read } = require('../../utils/FS')
const channels = read('channel/channels.json')

module.exports = {
    channels
}
