const paper = require('paper');

paper.setup(new paper.Size(1000, 1000));

const rect = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(100, 100));
const circle = new paper.Path.Circle(new paper.Point(110, 110), 50);

const result = rect.unite(circle);
console.log(result.exportSVG({ asString: true }));
