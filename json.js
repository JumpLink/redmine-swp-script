var fs = require('fs');

function save(filename, write_string) {
    write_string = JSON.stringify(write_string, null, 2)

    fs.writeFile(filename, write_string, function(err) {
        if(err) {
            console.log(err);
            process.exit(1);
        } else {
            console.log("The file was saved!");
        }
    });
}

function openSync(filename) {
    try {
      var data = JSON.parse(fs.readFileSync(__dirname +'/'+filename, 'utf8'));
    }
    catch (err) {
      console.error("There was an error opening the file:");
      console.log(err);
      data = err;
    }
    return data;
}


module.exports.save = save;
module.exports.open = openSync;