/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
/**********************************************************************************************
******************** 
*
*
*
${OTP-8891}:{Monthly Over Due Reminder for Customer}
*
*
**************************************************************************************************
*
*Author:Jobin and Jismi IT Services
*
*Date Created:04-June-2025
*
*Description:This script is designed to automates monthly email notifications for customers with overdue invoices, attaching a CSV file with
*invoice details. The sender is the Sales Rep or a static NetSuite Admin if none is assigned.
*
** REVISION HISTORY
 *
* @version 1.0 23-June-2025 : Created the initial build by JJ0403

***********************************************************************************************
**********************/

define(['N/search', 'N/email', 'N/file', 'N/log'],
    /**
     * @param {search} search
     * @param {email} email
     * @param {file} file
     * @param {log} log
     */
    (search, email, file, log) => {

        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */

        const getInputData = (inputContext) => fetchInvoiceData();

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        const map = (mapContext) => {
            try{
                const invoiceDetails = extractInvoiceDetails(mapContext.value);
                mapContext.write({
                    key: invoiceDetails.customerId,
                    value: invoiceDetails
                });
            } catch (error) {
                log.error('Error fetching invoice data', error.message);
            }
        };

       /**
         * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
         * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
         * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
         *     provided automatically based on the results of the map stage.
         * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
         *     reduce function on the current group
         * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
         * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} reduceContext.key - Key to be processed during the reduce stage
         * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
         *     for processing
         * @since 2015.2
         */

        const reduce = (reduceContext) => {
            try{
                const customerId = reduceContext.key;
                const invoiceDataList = reduceContext.values.map(JSON.parse);
                const csvFileData = generateCSVFile(invoiceDataList);
                sendInvoiceEmail(customerId, csvFileData);
            } catch (error) {
                log.error('Error fetching invoice data', error.message);
            }
        };

        /**
         * Fetches overdue invoice data using a search query.
         * @returns {Search} The overdue invoice search result.
         */
        const fetchInvoiceData = () => {
            try {
                return search.create({
                    title: 'Overdue Invoice JJ',
                    id: 'customsearch_jj_overdue_invoice',
                    type: "invoice",
                    filters: [
                        ["type", "anyof", "CustInvc"],
                        "AND",
                        ["daysoverdue", "greaterthan", "0"],
                        "AND",
                        ["mainline", "is", "T"],
                        "AND",
                        ["trandate", "onorbefore", "lastmonth"],
                        "AND",
                        ["customermain.isinactive","is","F"], 
                        
                    ],
                    columns: [
                        search.createColumn({ name: "entity", label: "Name" }),
                        search.createColumn({ name: "email", label: "Email" }),
                        search.createColumn({ name: "tranid", label: "Document Number" }),
                        search.createColumn({ name: "amount", label: "Amount" }),
                        search.createColumn({ name: "daysoverdue", label: "Days Overdue" }),
                        search.createColumn({
                            name: "salesrep",
                            join: "customerMain",
                            label: "Sales Rep"
                        }),  
                    ]
                });
            } catch (error) {
                log.error('Error fetching invoice data', error.message);
            }
        };

        /**
         * Extracts relevant details from invoice data.
         * @param {string} contextValue - JSON string containing the invoice data.
         * @returns {Object} The parsed invoice details.
         */
        const extractInvoiceDetails = (contextValue) => {
            try {
                const mapContextData = JSON.parse(contextValue);
                return {
                    customerName: mapContextData.values.entity.text,
                    customerId: mapContextData.values.entity.value,
                    customerEmail: mapContextData.values.email,
                    documentNo: mapContextData.values.tranid,
                    invoiceAmount: mapContextData.values.amount,
                    daysOverdue: mapContextData.values.daysoverdue,
                    salesRep: mapContextData.values['salesrep.customerMain'].value,
                };
            } catch (error) {
                log.error('Error extracting invoice details', error.message);
            }
        };

        /**
         * Generates a CSV file from overdue invoice details.
         * @param {Array} invoiceDataList - List of invoice data objects.
         * @returns {Object} The generated CSV file and metadata.
         */
        const generateCSVFile = (invoiceDataList) => {
            try {
                let csvContent = "Customer name,Email,Document number,Amount,Days Overdue\n";
                let csvName = "";
                let rep = "";
                let customer = "";
                let salesRepname='';

                invoiceDataList.forEach(data => {
                    csvContent += `${data.customerName},${data.customerEmail},${data.documentNo},${data.invoiceAmount},${data.daysOverdue} \n`;
                    csvName = `Days Overdue ${data.customerName}.csv`;
                    rep = data.salesRep;
                    salesRepname = data.salesRepName;
                    customer = data.customerName;
                });

                    const csvFile = file.create({
                        name: csvName,
                        fileType: file.Type.CSV,
                        contents: csvContent,
                        description: "This file contains the details of overdue invoice information till the previous month.",
                        encoding: file.Encoding.UTF8,
                        folder: -14,
                        isOnline: true,
                    });

                return { fileId: csvFile.save(), csvFile, rep, customer ,salesRepname};
            } catch (error) {
                log.error('Error generating CSV file', error.message);
            }
        };

        /**
         * Sends an email with the overdue invoice CSV attachment.
         * @param {string} recipientId - The customer ID.
         * @param {Object} csvFileData - The generated CSV file data.
         */
        const sendInvoiceEmail = (recipientId, csvFileData) => {
            try{
                let repData = csvFileData.rep; 
                let sender = -5; 
                let senderName = 'Cathy Cadigan';

                let filter = [];

                if (repData) {
                    filter = [
                        ["internalid", "anyof", repData],
                        "AND",
                        ["isinactive", "is", "F"]
                    ];
                } else {
                    filter = [["internalid", "anyof", ["-5"]]];
                }

                search.create({
                    type: "employee",
                    filters: filter,
                    columns: [
                        search.createColumn({ name: "entityid", label: "Name" }),
                        search.createColumn({ name: "internalid", label: "Internal ID" })
                    ]
                }).run().each((result) => {
                    senderName = result.getValue("entityid");
                    sender = result.getValue("internalid");
                    return false;
                });

                if (!sender) {
                    sender = -5;
                }
                        email.send({
                        author: sender,
                        recipients: recipientId,
                        subject: 'Overdue Invoices Notification',
                        body: `Dear ${csvFileData.customer},\n\n` +
                            'We hope you are doing well. Please find attached the details of your overdue invoices till the previous month.\n\n' +
                            'If you have any questions or need assistance, feel free to reach out.\n\n' +
                            'Best regards,\n' +
                            `${senderName }`,
                            
                        attachments: [csvFileData.csvFile]
                        });

            } catch (error) {
                log.error('Error sending invoice email', error.message);
            }
        };

        return { getInputData, map, reduce };
    });
