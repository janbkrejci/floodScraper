const request = require('request');
const C = require('cheerio');
const R = require('ramda');
const S = require('sanctuary');
const Future = require('fluture');

const fs = require('fs');
const { from } = require('form-data');

const URI = 'https://hydro.chmi.cz/hppsoldv/popup_hpps_prfdyn.php?seq=307024';


const fromFile = (path) =>
    Future((rej, res) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) {
                rej(`Soubor '${path}' se nepodařilo našíst. Důvod: '${err.message}'.`);
            } else {
                res(C.load(data));
            }
        });
        return () => console.log('Cancelled');
    }
    );


// type alias Html = String
// fromURL :: Url -> Future Err CheerioAPI
const fromURL = (url) =>
    Future((rej, res) => {
        C.fromURL(url).then((dom) => res(dom)).catch((err) => rej(err));
        return () => console.log('Cancelled');
    });

// type alias Html = String
// type alias DOM = Object // unknown structure, defined by Cheerio
// type alias Selector = String
// 1. loadDom :: Html -> DOM // UNUSED
const loadDom = x => C.load(x, null, false);
// 2. selectAll :: Selector -> DOM -> List DOM
// get all the elements that match the selector
const selectAll = R.curry((sel, dom) => {
    const res = dom(sel);
    // return res.length ? S.Right(R.map(C.load, res.toArray())) : S.Left(`Selektor '${sel}' nenalezen.`); //.toArray(); //R.map(C.load, res.toArray());
    return res.length ? S.Right(loadDom(res.html())) : S.Left(`Selektor '${sel}' nenalezen.`); //.toArray(); //R.map(C.load, res.toArray());
});
// 3. selectFirst :: Selector -> DOM -> Maybe DOM
// get the first selector that matches
const selectFirst = R.curry((sel, dom) =>
    R.compose(S.toMaybe, R.head, selectAll(sel))(dom)
);
// 4. attr :: String -> Dom -> Maybe String
const attr = R.curry((attrName, dom) =>
    R.compose(R.map(R.trim), S.toMaybe, dom.attr.bind(dom))(attrName)
);
// 5. text :: Dom -> String
const text = (dom) => R.trim(dom.text());

// required :: Err -> Selector -> Either Err String
const required = R.curry(
    (err, selector) =>
        R.compose(
            S.maybeToEither(err), // Either Err String
            R.map(text), // Maybe String
            selectFirst(selector)
        ) // Maybe Dom
);

// optional :: String -> Selector -> String
const optional = R.curry(
    (defaultValue, selector) =>
        R.compose(
            S.fromMaybe(defaultValue), // String
            R.map(text), // Maybe String
            selectFirst(selector)
        ) // Maybe Dom
);

// sequenceObject :: (* -> f *) -> Object (f *) -> f (Object *)
// This is basically R.sequence, but for objects
const sequenceObject = R.curry((appl, obj) => {
    // e.g. obj = {title: Maybe(1), summary: Maybe(2), year: Maybe(3)}

    const keys = R.keys(obj);
    // e.g. ['title', 'summary', 'year']
    const wrappedValues = R.values(obj);
    // e.g.[Maybe(1), Maybe(2), Maybe(3)]
    const unwrappedValues = R.sequence(appl, wrappedValues);
    // e.g. Maybe([1,2,3])
    return R.map(R.zipObj(keys))(unwrappedValues);
    // e.g. Maybe({ title: 1, summary: 2, year: 3 })
});

// decodeMovie :: DOM -> Either Err Movie
const decode = (dom) => {
    const obj = {
        table: required(
            'Tabulka nenalezena',
            '.tborder center_text table'
        )(dom)
    };
    // const obj = {
    //     title: required(
    //         'what the hell is it named?',
    //         '.title_block .title_wrapper h1'
    //     )(dom),

    //     summary: C.required(`Don't know what it's about!`, '.summary_text')(dom),
    //     year: S.Right(optional('', '.title_block #titleYear a')(dom)),

    //     director: required(
    //         'Could not find the director',
    //         '.plot_summary span[itemprop=director]'
    //     )(dom),
    // };
    return sequenceObject(S.of(S.Either), obj);
};

// Either a b -> Future a b
const eitherToFuture = x => Future((rej, res) => {
    S.isLeft(x) ? rej(x.value) : res(x.value);
    return () => console.log('Cancelled');
});

// scrapeUrl :: Url -> Future Err Movie
const scrapeUrl = R.compose(
    //R.map(R.map(x => ({ date: x[0], depth: x[1], flow: x[2], temperature: x[3] }))),

    //R.map(R.splitEvery(4)),
    //R.map(x => x.toArray().map(x => x.children[0].data)),
    //R.map(x => x.find('td')),
    //R.map(x => x('tr').toArray()),
    //R.map(selectAll('tbody')),
    // R.prop('value'),
    //R.tap(console.log),
    //R.chain(eitherToFuture),
    R.map(x => x('tr').toArray()[1].chilren[0].data),
    R.chain(eitherToFuture),
    R.map(selectAll('tbody')),
    R.chain(eitherToFuture),
    R.map(selectAll('.tborder.center_text table')), // Future Err CheerioAPI
    fromFile // String -> Future Err CheerioAPI
    //fromURL // String -> Future Err CheerioAPI
);

//<div class="tborder center_text" >
//<table style="width:100%;"></table>


const consume = Future.fork(reason => {
    console.error('Chyba:', reason);
})(value => {
    // console.log('Výstup:', value.next().next().html());
    console.log('Výstup:', value);
});

// consume(scrapeUrl('index.html'));
consume(scrapeUrl('index.html'));
