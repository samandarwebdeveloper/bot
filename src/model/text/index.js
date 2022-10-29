const { read } = require('../../utils/FS')

const allTexts = read('text/texts.json')

const texts = allTexts[0]

module.exports = {
    // menu: [
    //     [ keyboardTexts.products, keyboardTexts.about_us ],
    //     [ keyboardTexts.search ]
    // ],
    texts
}